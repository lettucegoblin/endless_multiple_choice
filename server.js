const express = require('express');
const axios = require('axios');
const bodyParser = require('body-parser');
const port = 9000;

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
})
.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});

function sanitizeQuizOutput(quiz) {
    // remove ```json and ``` from the quiz output
    quiz = quiz.replace(/```json/g, '').replace(/```/g, '');
    quiz = quiz.trim("\"") // remove leading and trailing quotes
    
    return JSON.parse(quiz); // IMPORTANT : parse the JSON string into an object so body-parser can handle it
}