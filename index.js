const fs = require('fs');
const path = require('path');
const express = require('express');
const { exec } = require('child_process');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const chokidar = require('chokidar');

const genAI = new GoogleGenerativeAI("");
const app = express();
const PORT = 5000;

const WATCH_DIRECTORY = "./incoming_files";
const FOLDERS = { "important": "./important", "entertainment": "./entertainment", "research": "./research" };

let log_data = [];

function logMessage(message) {
    log_data.push(message);
    if (log_data.length > 100) log_data.shift();
    console.log(message);
}

async function askGemini(filename) {
    try {
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const prompt = `Classify the file named '${filename}' into 'important', 'entertainment', or 'research'. Return only one of these words as output.`;
        const result = await model.generateContent(prompt);
        const folder = result.response.text().toLowerCase().trim();
        if (FOLDERS[folder]) return folder;
    } catch (error) {
        logMessage(`Error querying Gemini: ${error}`);
    }
    return "important";
}

function moveFile(filePath) {
    const filename = path.basename(filePath);
    logMessage(`New file detected: ${filename}`);
    
    askGemini(filename).then(folder => {
        const destFolder = FOLDERS[folder] || "./important";
        const destPath = path.join(destFolder, filename);
        
        fs.rename(filePath, destPath, (err) => {
            if (err) {
                logMessage(`Error moving file: ${err}`);
            } else {
                logMessage(`Moved '${filename}' to ${folder}`);
            }
        });
    });
}

app.use(express.static('public'));
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, './templates/index.html'));
});
app.get('/logs', (req, res) => {
    res.json(log_data);
});

function startMonitoring() {
    chokidar.watch(WATCH_DIRECTORY, { persistent: true }).on('add', moveFile);
}

app.listen(PORT, () => {
    Object.values(FOLDERS).forEach(folder => fs.mkdirSync(folder, { recursive: true }));
    fs.mkdirSync(WATCH_DIRECTORY, { recursive: true });
    
    logMessage(`Server running on http://localhost:${PORT}`);
    startMonitoring();
}); 