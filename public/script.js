// fetch from /api/quiz and display the result
document.addEventListener('DOMContentLoaded', () => {
    // fetch('/api/quiz')
    //     .then(response => response.json())  //MIDDLEWARE to handle JSON response
    //     .then(data => {
    //         const testOutput = document.getElementById('testoutput');  //get that div element
    //         testOutput.textContent = `
    //         Quiz Question: ${data.question}
    //         Options: ${data.options.join(', ')}
    //         Correct Answer: ${data.answer}
    //         `;
    //     })
    //     .catch(error => console.error('Error fetching quiz:', error));
    const socket = io();  // Initialize socket.io client

    socket.on('quiz-state', (quizState) => {
        const testOutput = document.getElementById('testoutput');  // Get the div element
        testOutput.textContent = `
            Quiz Question: ${quizState.currentQuestion}
            Options: ${quizState.currentOptions.join(', ')}
            Correct Answer: ${quizState.currentAnswer}
            # of players: ${Object.keys(quizState.players).length}
            Players: ${Object.values(quizState.players).map(player => player.name).join(', ')}
            Score: ${Object.values(quizState.players).map(player => `${player.name}: ${player.score}`).join(', ')}
        `;
    });
}); 