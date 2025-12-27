const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');
const path = require('path');
const os = require('os');

async function verify() {
    try {
        // Read settings
        const userDataPath = path.join(os.homedir(), 'AppData', 'Roaming', 'MonolithWidget'); // Adjust if app name is different
        // Actually, let's try to find where dataManager saves it. 
        // Based on dataManager.cjs:
        // const userDataPath = app.getPath('userData');
        // We can't easily guess the exact path without app name, but usually it's the package name.
        // Let's assume the user can paste the key or we read from the local file if we know where it is.

        // Better approach: Read from the file we know exists? 
        // The app is running in dev mode, so userData might be in a specific Electron folder.

        // Let's just ask the user to run this with their key, OR read from the hardcoded path if we can find it.
        // Wait, I can read the settings file using `read_file` tool first to get the key!

        console.log("Please run this script with your API KEY as an argument:");
        console.log("node verify-gemini.cjs YOUR_API_KEY");

        const apiKey = process.argv[2];
        if (!apiKey) {
            console.error("Error: No API Key provided.");
            return;
        }

        console.log(`Testing with Key: ${apiKey.substring(0, 5)}...`);
        const genAI = new GoogleGenerativeAI(apiKey);

        // 1. Try to get a model and generate content
        console.log("\n--- Attempting gemini-1.5-flash ---");
        try {
            const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
            const result = await model.generateContent("Hello");
            console.log("Success! Response:", result.response.text());
        } catch (e) {
            console.error("Failed:", e.message);
        }

        // 2. Try to list models (if supported by this SDK/Key)
        // Note: listModels might not be available on the client SDK directly in the same way, 
        // but let's check if we can simply try multiple models.

        // 3. Try to list models via REST API
        console.log("\n--- Listing Available Models via REST ---");
        const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.error) {
            console.error("ListModels Error:", JSON.stringify(data.error, null, 2));
        } else if (data.models) {
            console.log("Available Models:");
            data.models.forEach(m => console.log(`- ${m.name} (${m.supportedGenerationMethods})`));
        } else {
            console.log("No models found or unexpected response:", data);
        }

    } catch (error) {
        console.error("Fatal Error:", error);
    }
}

verify();
