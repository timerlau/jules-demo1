console.log("Background script loaded for Immersive Translate.");

// IMPORTANT: FOR DEVELOPMENT ONLY! Replace with your actual Microsoft Translator API key.
const MS_TRANSLATOR_API_KEY = "YOUR_API_KEY_HERE";
// IMPORTANT: Specify the region associated with your API key if applicable (e.g., "eastus").
const MS_TRANSLATOR_REGION = "YOUR_REGION_HERE"; // e.g., "eastus", remove or leave empty if not strictly needed by your key type

async function translateTextsWithMicrosoftAPI(texts, targetLanguage) {
  if (MS_TRANSLATOR_API_KEY === "YOUR_API_KEY_HERE") {
    console.error("Microsoft Translator API key not configured. Please update background.js.");
    return Promise.reject("API key not configured");
  }

  const apiUrl = `https://api.cognitive.microsofttranslator.com/translate?api-version=3.0&to=${targetLanguage}`;
  const requestBody = texts.map(text => ({ "Text": text }));

  const headers = {
    'Ocp-Apim-Subscription-Key': MS_TRANSLATOR_API_KEY,
    'Content-Type': 'application/json; charset=UTF-8'
  };

  if (MS_TRANSLATOR_REGION && MS_TRANSLATOR_REGION !== "YOUR_REGION_HERE" && MS_TRANSLATOR_REGION.trim() !== "") {
    headers['Ocp-Apim-Subscription-Region'] = MS_TRANSLATOR_REGION;
  }

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestBody)
    });

    if (response.ok) {
      const responseBody = await response.json();
      return responseBody.map(item => item.translations[0].text);
    } else {
      const errorText = await response.text();
      console.error("Microsoft Translator API Error:", response.status, errorText);
      return Promise.reject(`API request failed with status ${response.status}: ${errorText}`);
    }
  } catch (error) {
    console.error("Network error or problem fetching from Microsoft Translator API:", error);
    return Promise.reject(`Network error: ${error.message}`);
  }
}

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "translateMicrosoft") {
    console.log("Received translateMicrosoft message from content script with texts:", request.texts, "and target language:", request.targetLanguage);
    if (!request.texts || !request.targetLanguage) {
      console.error("Invalid request: texts or targetLanguage missing.");
      sendResponse({ error: "Invalid request: texts or targetLanguage missing." });
      return false; // No asynchronous response needed
    }

    translateTextsWithMicrosoftAPI(request.texts, request.targetLanguage)
      .then(translatedTexts => {
        sendResponse({ translatedTexts: translatedTexts });
      })
      .catch(error => {
        sendResponse({ error: error.toString() });
      });
    
    return true; // Indicates that the response will be sent asynchronously
  }
});
