## Todo

### frontend
- [x] make an index.html that just says "hello world"

### backend(node.js)
- [x] serve that index.html when visiting 127.0.0.1:8000/
  - [ ] implement node.js (Express.js) server to connect 
  - [ ] have the server fetch data from using an API key to connect to ollama for LLM question generation


## Mad dog's kahoot style front end:

### 🌱 Setup & Layout
- [ ] Create distinct `<div>` containers for: join screen, lobby, quiz, scoreboard
- [ ] Hide/show sections using CSS and JS depending on game phase
- [ ] Use `socket.id` to associate player with state from backend

### 🧑‍🤝‍🧑 Join + Lobby
- [ ] Add input for player nickname
- [ ] Emit player info to server upon join
- [ ] Show connected player list (`quizState.players`)
- [ ] Show "Start Quiz" button if first player

### ❓ Quiz Display
- [ ] Display current question in large font
- [ ] Show 4 buttons for answer choices (color-coded)
- [ ] Emit selected answer via `socket.emit('question-answered', answer)`
- [ ] Disable buttons after selection
- [ ] Highlight correct answer after timer ends

### 🧮 Scoreboard
- [ ] Display player scores in ranked order
- [ ] Highlight current user
- [ ] Show streaks or leaderboard changes (optional)

### 🌈 Styling
- [ ] Use bright Kahoot-like colors (`#f39c12`, `#e74c3c`, `#2ecc71`, `#3498db`)
- [ ] Add hover/focus states to answer buttons
- [ ] Add CSS transitions for smoother screen changes
- [ ] Animate score or leaderboard changes

### 🎮 Game Management
- [ ] Allow "Play Again" button to reset the state
- [ ] Handle disconnects gracefully (remove from list)
- [ ] Optional: Room code generation for private games

### 📦 Stretch Goals
- [ ] Add sound effects (correct, wrong, countdown)
- [ ] Add avatar icons to players
- [ ] Add timer bar animation
- [ ] Mobile-responsive layout

### Key:
- [x] means completed
- [ ] means in progress OR not yet completed