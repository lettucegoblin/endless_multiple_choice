// fetch from /api/quiz and display the result
document.addEventListener('DOMContentLoaded', () => {
    fetch('/api/quiz')
        .then(response => response.json())  //MIDDLEWARE to handle JSON response
        .then(data => {
            const testOutput = document.getElementById('testoutput');  //get that div element
            testOutput.textContent = `
            Quiz Question: ${data.question}
            Options: ${data.options.join(', ')}
            Correct Answer: ${data.answer}
            `;
        })
        .catch(error => console.error('Error fetching quiz:', error));
}); 