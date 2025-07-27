const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const port = 9000;

const { uniqueNamesGenerator, adjectives, animals, NumberDictionary } = require('unique-names-generator');

const API_BASE = "http://192.168.0.119:11434"         // your Ollama server
const MODEL = "gemma3:4b"                               // the model you want to use
const API_URL = `${API_BASE}/v1/chat/completions`
const API_KEY = "XXXXXXX"                              // ignored by Ollama but required header

/* example curl to ollama's v1
curl http://localhost:11434/v1/chat/completions \
    -H "Content-Type: application/json" \
    -d '{
        "model": "llama2",
        "messages": [
            {
                "role": "system",
                "content": "You are a helpful assistant."
            },
            {
                "role": "user",
                "content": "Hello!"
            }
        ]
    }'
*/

/* example response from Ollama
{
  "id": "chatcmpl-418",
  "object": "chat.completion",
  "created": 1753571140,
  "model": "gemma3:4b",
  "system_fingerprint": "fp_ollama",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello there! How can I help you today? 😊 \n\nDo you have a question, need some information, or just want to chat? Let me know!"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 22,
    "completion_tokens": 34,
    "total_tokens": 56
  }
}
*/
// serve static files from the 'public' directory
// e.g. /public/index.css, /public/script.js, /public/image.png
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

const freshQuizState = {
    currentQuestion: null,
    currentOptions: [],
    currentAnswer: null,
    players: {},
    answerCount: 0,  // When answerCount === Object.keys(players).length, everyone answered, so update answered state
    quizStarted: false,
};

const quizState = { ...freshQuizState }; // Initialize quiz state

function resetQuizState() {  // 1
    Object.assign(quizState, freshQuizState); // Reset quiz state to initial values
}

async function startQuiz(callback) {  // 2
    quizState.quizStarted = true;
    // get a new question from the LLM
    try {
        const question = await getQuizQuestion();
        quizState.currentQuestion = question.question;
        quizState.currentOptions = question.options;
        quizState.currentAnswer = question.answer;
        console.log("Quiz question set:", quizState.currentQuestion);
        callback(question); // Call the callback with the new question
    } catch (error) {
        console.error("Error getting quiz question:", error);
    }
}

async function getQuizQuestion() {  // 3
    // Call the LLM to get a new quiz question
    const response = await axios.post(API_URL, {
        model: MODEL,
        messages: [
            {
                role: "system",
                content: `You are a multiple choice quiz generator.
Generate in JSON format a multiple choice quiz with 4 options.
For example:
{
    "question": "What is the capital of France?",
    "options": ["Berlin", "Madrid", "Paris", "Rome"],
    "answer": "Paris"
}`
            },
            {
                role: "user",
                content: "Generate a multiple choice quiz question."
            }
        ]
    }, {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}` // Ollama does not require this, but it's included for compatibility
        }
    });

    return new Promise((resolve, reject) => {
        if ((response.data) && (response.data.choices) && (response.data.choices.length > 0)) {
            const quiz = sanitizeQuizOutput(response.data.choices[0].message.content);
            console.log("Quiz question generated:", quiz);
            resolve(quiz);
        } else {
            reject(new Error("Failed to generate quiz question"));
        }
    });
}

io.on('connection', function(socket){
    console.log('A user connected', socket.id);  // Log the socket ID of the connected user
    /* player states: 
        1 --> player connected, quiz has not started, and they're alone. (fresh state)
        2 --> player connected, quiz has started, and they're alone. (stale state from previous game)
        3 --> player connected, quiz has started, and they're NOT alone. (joining a game in progress)
    */
    // initialize ourself in the quiz state (adding ourself as a player)
    const playerName = uniqueNamesGenerator({
        dictionaries: [adjectives, animals, NumberDictionary.generate({ min: 1, max: 99 })],
        separator: '',
        style: 'capital'
    });
    
    console.log('New player name:', playerName); // Example: "RedPanda47"
    quizState.players[socket.id] = {
         score: 0,
         answered: false,
         name: playerName
        };
    
      // state 1: when it's a fresh state:
    if (!quizState.quizStarted) {
        // TODO: start quiz
        startQuiz((question) => {
            quizState.currentQuestion = question.question;
            quizState.currentOptions = question.options;
            quizState.currentAnswer = question.answer;
            console.log("Quiz question set:", quizState.currentQuestion);
            socket.emit('quiz-state', quizState); // send the quiz state to the player
        });
    } // state 2: when it's a stale state:
    else if (quizState.quizStarted && Object.keys(quizState.players).length === 1) {
        resetQuizState();
    } // state 3: when it's a game in progress:
    else if (quizState.quizStarted && Object.keys(quizState.players).length > 1) { 
        socket.emit('quiz-state', quizState);
    }

    socket.on('question-answered', function(answer) {
        console.log('User answered:', answer);
    });

    //Whenever someone disconnects this piece of code executed
    socket.on('disconnect', function () {
        console.log('A user disconnected');
        // remove the player from the quiz state
        delete quizState.players[socket.id];
        // if there are no players left, reset the quiz state
        if (Object.keys(quizState.players).length === 0) {
            resetQuizState();
        } else {
            // if there are still players left, emit the updated quiz state
            io.emit('quiz-state', quizState);
        }
    });
});

app.use(express.static('public'))
.use(bodyParser.json())
.use(bodyParser.urlencoded({ extended: true }))
.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
})
.get('/hellollm', async (req, res) => {
    const response = await axios.post(API_URL, {
        model: MODEL,
        messages: [
            {
                role: "system",
                content: "You are a helpful assistant."
            },
            {
                role: "user",
                content: "what is your favorite color?"
            }
        ]
            
    }, {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}` // Ollama does not require this, but it's included for compatibility
        }
    });

    console.log("what the llm said:", response)
    res.json(response.data);
})
.get('/api/quiz', async (req, res) => {
    const response = await axios.post(API_URL, {
        model: MODEL,
        messages: [
            {
                role: "system",
                content: `You are a multiple choice quiz generator. 
Generate in JSON format a multiple choice quiz with 4 options.
For example:
{
    "question": "What is the capital of France?",
    "options": ["Berlin", "Madrid", "Paris", "Rome"],
    "answer": "Paris"
}`
            },
            {
                role: "user",
                content: "Generate a multiple choice quiz question."
            }
        ]
    }, {
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}` // Ollama does not require this, but it's included for compatibility
        }
    });
    console.log("Quiz question generated:", response.data);
    const quiz = sanitizeQuizOutput(response.data.choices[0].message.content);
    console.log("sanitized Quiz question sent to client:", quiz);
    // send the quiz question to the client
    res.json(quiz);
});

http.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});

function sanitizeQuizOutput(quiz) {
    // remove ```json and ``` from the quiz output
    quiz = quiz.replace(/```json/g, '').replace(/```/g, '');
    quiz = quiz.trim("\"") // remove leading and trailing quotes
    
    return JSON.parse(quiz); // IMPORTANT : parse the JSON string into an object so body-parser can handle it
}