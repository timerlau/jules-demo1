console.log("Immersive Translate content script loaded and ready.");

function extractTextAndElements() {
  const selectors = 'p, h1, h2, h3, h4, h5, h6, li, td, th, span, div, a, blockquote, pre, code, em, strong, i, b, u, article, section, aside, nav, header, footer, main, summary, details, figcaption';
  const elements = document.querySelectorAll(selectors);
  const elementsAndTexts = [];

  elements.forEach(element => {
    if (element.classList.contains('immersive-translate-clone')) {
      return;
    }
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || element.offsetParent === null) {
      return; 
    }

    let directText = '';
    element.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        directText += node.nodeValue;
      }
    });

    const trimmedText = directText.trim();
    if (trimmedText) {
      if (element.children.length > 0 && trimmedText.length < (element.textContent.trim().length / 2)) {
          const tag = element.tagName.toLowerCase();
          if (!['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'td', 'th', 'blockquote', 'pre', 'code', 'em', 'strong', 'i', 'b', 'u', 'span', 'a', 'div'].includes(tag) && element.children.length > 0) {
             return;
          }
      }
      elementsAndTexts.push({ originalElement: element, text: trimmedText });
    }
  });

  return elementsAndTexts;
}

function removePreviousTranslations() {
  const previousTranslations = document.querySelectorAll('.immersive-translate-clone');
  previousTranslations.forEach(el => el.remove());
}

chrome.runtime.onMessage.addListener(function(request, sender, sendResponseToPopup) {
  if (request.action === "translate") {
    console.log("Received translate message from popup.");

    removePreviousTranslations();
    const elementsToTranslate = extractTextAndElements();
    console.log("Elements to translate:", elementsToTranslate);

    if (elementsToTranslate.length === 0) {
      console.log("No text found to translate.");
      sendResponseToPopup({ status: "No text found to translate.", count: 0 });
      return false; // No async operation, send response directly
    }

    const textsToTranslateArray = elementsToTranslate.map(item => item.text);
    const targetLanguage = "zh-Hans"; // Hardcoded for now

    console.log(`Requesting translation for ${textsToTranslateArray.length} texts to ${targetLanguage}.`);

    chrome.runtime.sendMessage(
      { action: "translateMicrosoft", texts: textsToTranslateArray, targetLanguage: targetLanguage },
      function(responseFromBackground) {
        if (chrome.runtime.lastError) {
          console.error("Error sending message to background script or receiving response:", chrome.runtime.lastError.message);
          sendResponseToPopup({ status: "Error communicating with background script.", error: chrome.runtime.lastError.message });
          return;
        }
        
        if (responseFromBackground.error) {
          console.error("Translation API Error:", responseFromBackground.error);
          sendResponseToPopup({ status: "Translation failed.", error: responseFromBackground.error, count: 0 });
          // Optionally, display an error message to the user on the page
          const errorDiv = document.createElement('div');
          errorDiv.textContent = `Translation Error: ${responseFromBackground.error}`;
          errorDiv.style.color = 'red';
          errorDiv.style.position = 'fixed';
          errorDiv.style.top = '10px';
          errorDiv.style.left = '10px';
          errorDiv.style.backgroundColor = 'white';
          errorDiv.style.padding = '10px';
          errorDiv.style.zIndex = '10000';
          errorDiv.classList.add('immersive-translate-clone'); // So it gets removed on next attempt
          document.body.appendChild(errorDiv);
          return;
        }

        if (responseFromBackground.translatedTexts && responseFromBackground.translatedTexts.length === elementsToTranslate.length) {
          console.log("Received translated texts:", responseFromBackground.translatedTexts);
          elementsToTranslate.forEach((item, index) => {
            const translatedText = responseFromBackground.translatedTexts[index];
            
            let translatedElement = document.createElement('div');
            translatedElement.textContent = translatedText;
            translatedElement.classList.add('immersive-translate-clone');
            
            translatedElement.style.color = 'blue'; // Changed color for real translation
            translatedElement.style.fontSize = '0.9em';
            translatedElement.style.marginTop = '2px';
            translatedElement.style.marginBottom = '5px';
            translatedElement.style.fontStyle = 'italic';

            if (item.originalElement.parentNode) {
              item.originalElement.parentNode.insertBefore(translatedElement, item.originalElement.nextSibling);
            } else {
              console.warn("Original element has no parentNode:", item.originalElement);
              document.body.appendChild(translatedElement);
            }
          });
          console.log("Real translation displayed on page.");
          sendResponseToPopup({ status: "Page content translated and displayed.", count: elementsToTranslate.length });
        } else {
          console.error("Mismatch in translated texts count or no translated texts received.");
          sendResponseToPopup({ status: "Translation data mismatch.", error: "Mismatch or no translated texts.", count: 0 });
        }
      }
    );
    
    return true; // Crucial: Indicates that sendResponseToPopup will be called asynchronously
  }
});
