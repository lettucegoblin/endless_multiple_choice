# Multiplayer Endless Multiple‑Choice Quiz WebApp (FastAPI + WebSockets)
# ----------------------------------------------------------------------
# v1.0 (Autogen‑free)
#   • Replaced Autogen with direct Ollama chat completion via HTTP → no more CLI prompts!
#   • Fully async‑friendly: JSON fetch runs in thread to avoid blocking the event loop.
#   • Keeps everything else (FastAPI, websockets, Tailwind UI) unchanged.
# ----------------------------------------------------------------------

import asyncio, json, re, uuid, logging, requests
from typing import Dict, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware

logger = logging.getLogger("quiz")
logging.basicConfig(level=logging.INFO)

# ----------------------------------------------------------------------
# 1) LLM CONFIGURATION (Ollama OpenAI‑compat) ---------------------------
# ----------------------------------------------------------------------
API_BASE = "http://192.168.0.119:11434/v1"  # ↖ your Ollama server
MODEL = "gemma3:4b"
API_KEY = "asdf"  # ignored by Ollama but required header

HEADERS = {"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"}
_JSON_RE = re.compile(r"\{[\s\S]*?\}")

async def ask_llm(messages):
    """POST to /chat/completions in a background thread; return assistant content string."""
    def _post():
        body = {"model": MODEL, "messages": messages, "temperature": 0.7, "stream": False}
        r = requests.post(f"{API_BASE}/chat/completions", headers=HEADERS, json=body, timeout=30)
        r.raise_for_status()
        return r.json()["choices"][0]["message"]["content"]
    return await asyncio.to_thread(_post)

async def extract_json(text:str)->Optional[dict]:
    m=_JSON_RE.search(text)
    if not m: return None
    try: return json.loads(m.group(0))
    except json.JSONDecodeError: return None

async def generate_question(genre:str)->dict:
    sys_prompt="You are a quiz question generator. Respond ONLY with JSON object containing keys: question, choices (3‑6 strings), answer_index (int)."
    user_prompt=f"Generate one multiple‑choice question for genre '{genre}'."
    for attempt in range(3):
        try:
            content=await ask_llm([
                {"role":"system","content":sys_prompt},
                {"role":"user","content":user_prompt}
            ])
            data=await extract_json(content)
            if data and isinstance(data.get("question"),str) and isinstance(data.get("choices"),list):
                ai=data.get("answer_index")
                if isinstance(ai,int) and 0<=ai<len(data["choices"]):
                    return data
        except Exception as e:
            logger.warning(f"Question gen attempt {attempt+1} failed: {e}")
    logger.error("Falling back to static question.")
    return {
        "question":"Which language runs natively in web browsers?",
        "choices":["Python","Java","JavaScript","C#"],
        "answer_index":2,
    }

# ----------------------------------------------------------------------
# 2) GAME STATE ---------------------------------------------------------
# ----------------------------------------------------------------------
class Player:
    def __init__(self, ws:WebSocket, name:str):
        self.ws,self.name,self.score,self.id=ws,name,0,str(uuid.uuid4())

class GameState:
    def __init__(self):
        self.players: Dict[str, Player] = {}
        self.current_question: Optional[dict] = None
        self.answers: Dict[str,int] = {}
        self.genre="general knowledge"
        self.lock=asyncio.Lock()
    async def broadcast(self,msg):
        dead=[]
        for pid,p in self.players.items():
            try: await p.ws.send_text(json.dumps(msg))
            except WebSocketDisconnect: dead.append(pid)
        for pid in dead: self.players.pop(pid,None)

game=GameState()

# ----------------------------------------------------------------------
# 3) FASTAPI + WEBSOCKETS ----------------------------------------------
# ----------------------------------------------------------------------
app=FastAPI()
app.add_middleware(CORSMiddleware,allow_origins=["*"],allow_credentials=True,allow_methods=["*"],allow_headers=["*"])

HTML_UI="""<!doctype html><html class='h-full'><head><meta charset='utf-8'/><script src='https://cdn.tailwindcss.com'></script><title>Quiz</title></head><body class='h-full flex flex-col items-center bg-gray-100 p-4'><h1 class='text-2xl font-bold mb-2'>Multiplayer Quiz</h1><input id='genreInput' class='border p-2 w-full max-w-md mb-4' placeholder='Enter genre (e.g., science)…'/><div class='flex w-full max-w-4xl gap-4'><div class='flex-1'><div id='question' class='text-xl font-medium mb-4'></div><div id='choices' class='flex flex-col gap-2'></div></div><div class='w-48 bg-white rounded shadow p-2'><h2 class='font-semibold mb-1'>Players</h2><ul id='playerList' class='space-y-1 text-sm'></ul></div></div><script>const ws=new WebSocket(`ws://${location.host}/ws`);const name=prompt('Name?')||`Guest_${Math.floor(Math.random()*1e3)}`;ws.onopen=_=>ws.send(JSON.stringify({type:'join',name}));ws.onmessage=e=>render(JSON.parse(e.data).state);function sendAns(i){ws.send(JSON.stringify({type:'answer',index:i}))}function render(s){document.getElementById('question').textContent=s.question.question;const cd=document.getElementById('choices');cd.innerHTML='';(s.question.choices||[]).forEach((t,i)=>{const b=document.createElement('button');b.textContent=t;b.className='border rounded p-2 hover:bg-blue-100';if(s.hasAnswered)b.disabled=true;b.onclick=_=>sendAns(i);cd.appendChild(b)});const ul=document.getElementById('playerList');ul.innerHTML='';Object.values(s.players).forEach(p=>{const li=document.createElement('li');li.textContent=`${p.name}: ${p.score}`;ul.appendChild(li)});}document.getElementById('genreInput').addEventListener('keydown',e=>{if(e.key==='Enter')ws.send(JSON.stringify({type:'genre',genre:e.target.value}))});</script></body></html>"""

@app.get("/")
async def index():
    return HTMLResponse(HTML_UI)

@app.websocket("/ws")
async def ws_endpoint(ws:WebSocket):
    await ws.accept(); player=None
    try:
        while True:
            data=json.loads(await ws.receive_text())
            if data["type"]=="join":
                async with game.lock:
                    player=Player(ws,data.get("name","Guest")); game.players[player.id]=player; await _send_state(player)
                    if not game.current_question: asyncio.create_task(_start_round())
            elif data["type"]=="answer" and player:
                async with game.lock:
                    if game.current_question and player.id not in game.answers:
                        game.answers[player.id]=int(data["index"]); await _broadcast_state(); await _maybe_next()
            elif data["type"]=="genre":
                async with game.lock: game.genre=data.get("genre",game.genre)
    except WebSocketDisconnect:
        if player:
            async with game.lock:
                game.players.pop(player.id, None)
                await _broadcast_state()

# ----------------------------------------------------------------------
# 4) GAME FLOW ----------------------------------------------------------
# ----------------------------------------------------------------------
async def _start_round():
    game.current_question=await generate_question(game.genre); game.answers.clear(); await _broadcast_state()

async def _maybe_next():
    if len(game.answers)==len(game.players):
        correct=game.current_question["answer_index"]
        for pid,ans in game.answers.items():
            if ans==correct: game.players[pid].score+=1
        await _broadcast_state(show_correct=True); await asyncio.sleep(3); await _start_round()

async def _send_state(pl:Player):
    await pl.ws.send_text(json.dumps({"type":"state","state":_state(pl.id)}))

async def _broadcast_state(show_correct:bool=False):
    await game.broadcast({"type":"state","state":_state(None if show_correct else '')})

def _state(req_id:Optional[str]):
    return {"players":{pid:{"name":p.name,"score":p.score} for pid,p in game.players.items()},
            "question":game.current_question or {"question":"Waiting…","choices":[]},
            "hasAnswered": bool(req_id and req_id in game.answers)}

@app.on_event("startup")
async def on_start():
    logger.info("Quiz ready → http://127.0.0.1:8000")

# ----------------------------------------------------------------------
if __name__=="__main__":
    import uvicorn; uvicorn.run("multiplayer_quiz:app",host="0.0.0.0",port=8000,reload=True)
