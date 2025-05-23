console.log("Background script loaded for Immersive Translate.");

// IMPORTANT: FOR DEVELOPMENT ONLY! Replace with your actual Microsoft Translator API key.
const MS_TRANSLATOR_API_KEY = "YOUR_API_KEY_HERE";
// IMPORTANT: Specify the region associated with your API key if applicable (e.g., "eastus").
// Note: This key and region may also be used for Azure Speech Service (TTS).
// Ensure your Azure resource supports both Translation and Speech, or configure separate keys/regions if needed.
const MS_TRANSLATOR_REGION = "YOUR_REGION_HERE"; // e.g., "eastus", remove or leave empty if not strictly needed by your key type

// IMPORTANT: FOR DEVELOPMENT ONLY! Replace with your actual Google Cloud API Key.
const GOOGLE_TRANSLATE_API_KEY = "YOUR_GOOGLE_API_KEY_HERE";

function escapeXml(unsafeText) {
  return unsafeText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function arrayBufferToBase64(buffer) {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

async function translateTextsWithMicrosoftAPI(texts, targetLanguage) {
  if (MS_TRANSLATOR_API_KEY === "YOUR_API_KEY_HERE") {
    console.error("Microsoft Translator API key not configured. Please update background.js.");
    return Promise.reject("Microsoft API key not configured");
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
      return Promise.reject(`Microsoft API request failed with status ${response.status}: ${errorText}`);
    }
  } catch (error) {
    console.error("Network error or problem fetching from Microsoft Translator API:", error);
    return Promise.reject(`Network error (Microsoft): ${error.message}`);
  }
}

async function translateTextsWithGoogleAPI(texts, targetLanguage, sourceLanguage) {
  if (GOOGLE_TRANSLATE_API_KEY === "YOUR_GOOGLE_API_KEY_HERE") {
    console.error("Google Translate API key not configured. Please update background.js.");
    return Promise.reject("Google API key not configured");
  }

  const apiUrl = `https://translation.googleapis.com/language/translate/v2?key=${GOOGLE_TRANSLATE_API_KEY}`;
  
  const requestPayload = {
    q: texts,
    target: targetLanguage,
    format: "text"
  };

  if (sourceLanguage) {
    requestPayload.source = sourceLanguage;
  }

  const headers = {
    'Content-Type': 'application/json'
  };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(requestPayload)
    });

    const responseBody = await response.json();

    if (response.ok) {
      if (responseBody.data && responseBody.data.translations) {
        return responseBody.data.translations.map(item => item.translatedText);
      } else {
        console.error("Google Translate API Error: Unexpected response format", responseBody);
        return Promise.reject("Google API request failed: Unexpected response format");
      }
    } else {
      let errorMessage = "Google API request failed";
      if (responseBody.error && responseBody.error.message) {
        errorMessage = responseBody.error.message;
      }
      console.error("Google Translate API Error:", response.status, responseBody);
      return Promise.reject(`${errorMessage} (Status: ${response.status})`);
    }
  } catch (error) {
    console.error("Network error or problem fetching from Google Translate API:", error);
    return Promise.reject(`Network error (Google): ${error.message}`);
  }
}

async function synthesizeSpeechWithAzureTTS(text, languageCode, voiceName) {
  if (MS_TRANSLATOR_API_KEY === "YOUR_API_KEY_HERE") {
    console.error("Azure API key not configured for Speech. Please update background.js.");
    return Promise.reject("Azure API key not configured for Speech");
  }
  if (MS_TRANSLATOR_REGION === "YOUR_REGION_HERE" || !MS_TRANSLATOR_REGION) {
    console.error("Azure region not configured for Speech. Please update background.js.");
    return Promise.reject("Azure region not configured for Speech");
  }

  const ttsApiUrl = `https://${MS_TRANSLATOR_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`;
  
  const ssmlBody = `
    <speak version='1.0' xml:lang='${languageCode}'>
        <voice xml:lang='${languageCode}' name='${voiceName}'>
            ${escapeXml(text)}
        </voice>
    </speak>
  `;

  const headers = {
    'Ocp-Apim-Subscription-Key': MS_TRANSLATOR_API_KEY,
    'Content-Type': 'application/ssml+xml',
    'X-Microsoft-OutputFormat': 'audio-24khz-160kbitrate-mono-mp3',
    'User-Agent': 'ImmersiveTranslateExtension/0.1'
  };

  try {
    const response = await fetch(ttsApiUrl, {
      method: 'POST',
      headers: headers,
      body: ssmlBody
    });

    if (response.ok) {
      const audioArrayBuffer = await response.arrayBuffer();
      const base64String = arrayBufferToBase64(audioArrayBuffer);
      return `data:audio/mpeg;base64,${base64String}`;
    } else {
      const errorText = await response.text();
      console.error("Azure TTS API Error:", response.status, errorText);
      return Promise.reject(`Azure TTS API request failed with status ${response.status}: ${errorText}`);
    }
  } catch (error) {
    console.error("Network error or problem fetching from Azure TTS API:", error);
    return Promise.reject(`Network error (Azure TTS): ${error.message}`);
  }
}


chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.action === "translateMicrosoft") {
    console.log("Received translateMicrosoft message with texts:", request.texts, "and target language:", request.targetLanguage);
    if (!request.texts || !request.targetLanguage) {
      console.error("Invalid Microsoft translate request: texts or targetLanguage missing.");
      sendResponse({ error: "Invalid Microsoft translate request: texts or targetLanguage missing." });
      return false; 
    }

    translateTextsWithMicrosoftAPI(request.texts, request.targetLanguage)
      .then(translatedTexts => {
        sendResponse({ translatedTexts: translatedTexts });
      })
      .catch(error => {
        sendResponse({ error: error.toString() });
      });
    
    return true;
  
  } else if (request.action === "translateGoogle") {
    console.log("Received translateGoogle message with texts:", request.texts, 
                "target language:", request.targetLanguage, 
                "source language:", request.sourceLanguage);

    if (!request.texts || !request.targetLanguage) {
      console.error("Invalid Google translate request: texts or targetLanguage missing.");
      sendResponse({ error: "Invalid Google translate request: texts or targetLanguage missing." });
      return false;
    }

    translateTextsWithGoogleAPI(request.texts, request.targetLanguage, request.sourceLanguage)
      .then(translatedTexts => {
        sendResponse({ translatedTexts: translatedTexts });
      })
      .catch(error => {
        sendResponse({ error: error.toString() });
      });
      
    return true;
  
  } else if (request.action === "synthesizeSpeechAzure") {
    console.log("Received synthesizeSpeechAzure message with text:", request.text,
                "languageCode:", request.languageCode,
                "voiceName:", request.voiceName);

    if (!request.text || !request.languageCode || !request.voiceName) {
      console.error("Invalid Azure TTS request: text, languageCode, or voiceName missing.");
      sendResponse({ error: "Invalid Azure TTS request: text, languageCode, or voiceName missing." });
      return false;
    }

    synthesizeSpeechWithAzureTTS(request.text, request.languageCode, request.voiceName)
      .then(audioDataUri => {
        sendResponse({ audioDataUri: audioDataUri });
      })
      .catch(error => {
        sendResponse({ error: error.toString() });
      });
      
    return true;
  }
});
