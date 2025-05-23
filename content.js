console.log("Immersive Translate content script loaded and ready.");

// Global variable to manage the playback interval
let captionPlaybackIntervalId = null; 

function extractTextAndElements() {
  const selectors = 'p, h1, h2, h3, h4, h5, h6, li, td, th, span, div, a, blockquote, pre, code, em, strong, i, b, u, article, section, aside, nav, header, footer, main, summary, details, figcaption';
  const elements = document.querySelectorAll(selectors);
  const elementsAndTexts = [];

  elements.forEach(element => {
    if (element.classList.contains('immersive-translate-clone') || element.id === 'translateYouTubeCaptionsBtn') {
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

// --- YouTube Caption Specific Functions ---

function getVideoId() {
  const params = new URLSearchParams(window.location.search);
  return params.get('v');
}

async function getCaptionTracks(videoId) {
  let pageHtml = '';
  let captionTracks = null;

  const scripts = Array.from(document.getElementsByTagName('script'));
  for (const script of scripts) {
    if (script.textContent) {
      const match = script.textContent.match(/"captionTracks":(\[.*?\])/);
      if (match && match[1]) {
        try {
          captionTracks = JSON.parse(match[1]);
          console.log("Found captionTracks in existing script tag:", captionTracks);
          return captionTracks;
        } catch (e) {
          console.error("Error parsing captionTracks from script tag:", e);
        }
      }
    }
  }

  console.log("captionTracks not found in script tags, fetching page HTML for video:", videoId);
  try {
    const response = await fetch(window.location.href);
    pageHtml = await response.text();
    const match = pageHtml.match(/"captionTracks":(\[.*?\])/);
    if (match && match[1]) {
      try {
        captionTracks = JSON.parse(match[1]);
        console.log("Found captionTracks in fetched HTML:", captionTracks);
        return captionTracks;
      } catch (e) {
        console.error("Error parsing captionTracks from fetched HTML:", e);
      }
    }
  } catch (e) {
    console.error("Error fetching page HTML for captionTracks:", e);
  }
  
  if (!captionTracks) {
      console.error(`Could not find captions data for video: ${videoId}`);
  }
  return captionTracks;
}

function selectCaptionTrack(captionTracks) {
  if (!captionTracks || captionTracks.length === 0) {
    console.log("No caption tracks available.");
    return null;
  }
  let selectedTrack = captionTracks.find(track => track.vssId === '.en');
  if (!selectedTrack) {
    selectedTrack = captionTracks.find(track => track.vssId === 'a.en');
  }
  if (!selectedTrack) {
    selectedTrack = captionTracks.find(track => track.vssId && track.vssId.endsWith('.en'));
  }

  if (selectedTrack) {
    console.log("Selected English caption track:", selectedTrack);
    return selectedTrack.baseUrl;
  } else {
    console.log("No English caption track found. Available tracks:", captionTracks.map(t => t.vssId));
    return null;
  }
}

function decodeHtmlEntities(text) {
  const textArea = document.createElement('textarea');
  textArea.innerHTML = text;
  let decoded = textArea.value;
  decoded = decoded.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  return decoded;
}

function stripHtmlTags(html) {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || "";
}

async function fetchAndParseCaptionXml(baseUrl) {
  try {
    const response = await fetch(baseUrl);
    if (!response.ok) {
      console.error(`Failed to fetch caption XML: ${response.status} ${response.statusText}`);
      return null;
    }
    const xmlText = await response.text();
    
    const lines = [];
    const transcript = xmlText
      .replace(/<\?xml[^>]*\?>/i, '')
      .replace(/<transcript[^>]*>/i, '')
      .replace(/<\/transcript>/i, '');
      
    const segments = transcript.split('</text>');

    segments.forEach(segment => {
      if (segment && segment.trim()) {
        const textContentMatch = segment.match(/<text[^>]*>(.*)/is);
        let text = textContentMatch && textContentMatch[1] ? textContentMatch[1].trim() : '';
        
        text = decodeHtmlEntities(text);
        text = stripHtmlTags(text);

        const startMatch = segment.match(/start="([\d.]+)"/);
        const durMatch = segment.match(/dur="([\d.]+)"/);

        if (startMatch && startMatch[1] && text) {
          lines.push({
            start: parseFloat(startMatch[1]),
            dur: durMatch && durMatch[1] ? parseFloat(durMatch[1]) : 0.0,
            text: text
          });
        }
      }
    });
    console.log("Parsed captions:", lines);
    return lines;
  } catch (e) {
    console.error("Error fetching or parsing caption XML:", e);
    return null;
  }
}

function playAudiosInSync(audioQueue) {
  const video = document.querySelector('video');
  if (!video) {
    console.error("Could not find video element for synchronized playback.");
    return;
  }

  // Clear any existing playback interval
  if (captionPlaybackIntervalId) {
    clearInterval(captionPlaybackIntervalId);
    captionPlaybackIntervalId = null;
  }

  // Sort queue by start time
  audioQueue.sort((a, b) => a.startTime - b.startTime);
  
  let currentAudioIndex = 0;

  captionPlaybackIntervalId = setInterval(() => {
    if (currentAudioIndex >= audioQueue.length) {
      clearInterval(captionPlaybackIntervalId);
      captionPlaybackIntervalId = null;
      console.log("Finished playing all caption audios.");
      return;
    }

    const item = audioQueue[currentAudioIndex];
    // Check if video is playing and current time is past the audio start time
    if (!video.paused && video.currentTime >= item.startTime) {
      if (!item.played) {
        console.log(`Playing audio for caption at ${item.startTime}s: "${item.originalText}" -> "${item.translatedText}"`);
        item.audio.play().catch(e => console.error("Error playing audio:", e));
        item.played = true; 
        // Optional: Could display the translated text on screen here as well
        currentAudioIndex++; // Move to next audio
      } else {
        // If it was marked played but we are still before the next one, advance if needed or handle seeking.
        // For simple forward playback, this might not be strictly needed if currentAudioIndex is advanced correctly.
        // However, if user seeks back, this logic would need to be more robust.
        if(video.currentTime < item.startTime || (item.startTime + item.duration < video.currentTime) ) {
            // If user seeked backward or far forward past this clip.
            // This simple model will just continue from where it left off or skip.
            // A more robust solution would re-evaluate currentAudioIndex based on video.currentTime.
        }
      }
    }
    // If video is paused, do nothing until it resumes.
    // If currentAudioIndex is already played, the interval will keep checking for the next one.
  }, 100); // Check every 100ms

  console.log("Synchronized audio playback started.");
}


async function handleYouTubeCaptionTranslation() {
  console.log("Translate YouTube Captions button clicked.");
  // Clear previous playback loop if any
  if (captionPlaybackIntervalId) {
    clearInterval(captionPlaybackIntervalId);
    captionPlaybackIntervalId = null;
    console.log("Cleared previous caption playback interval.");
  }
  // Potentially also clear any visual overlays of translated captions if implemented later

  const videoId = getVideoId();
  if (!videoId) {
    console.error("Could not get YouTube video ID.");
    return;
  }
  console.log("YouTube Video ID:", videoId);

  const captions = await fetchAndParseCaptionXml( (await selectCaptionTrack(await getCaptionTracks(videoId))) ); // Chained for brevity

  if (!captions || captions.length === 0) {
    console.log("No captions found or failed to parse. Exiting translation process.");
    return;
  }

  const textsToTranslate = captions.map(cap => cap.text);
  const targetLanguage = "zh-Hans"; // For Microsoft Translator
  const ttsLanguageCode = "zh-CN"; // For Azure TTS
  const ttsVoiceName = "zh-CN-YunxiNeural"; // Example Azure voice

  console.log(`Sending ${textsToTranslate.length} caption texts for translation to ${targetLanguage}.`);

  chrome.runtime.sendMessage(
    { action: "translateMicrosoft", texts: textsToTranslate, targetLanguage: targetLanguage },
    response => {
      if (chrome.runtime.lastError) {
        console.error("Error sending/receiving from background (translateMicrosoft):", chrome.runtime.lastError.message);
        return;
      }
      if (response.error) {
        console.error("Translation API Error (Microsoft):", response.error);
        return;
      }
      if (!response.translatedTexts || response.translatedTexts.length !== captions.length) {
        console.error("Translated texts count mismatch or missing.", response);
        return;
      }

      console.log("Received translated texts:", response.translatedTexts);
      const audioQueue = [];
      let ttsRequestsPending = response.translatedTexts.length;

      response.translatedTexts.forEach((translatedText, index) => {
        const originalCaption = captions[index];
        if (!translatedText || translatedText.trim() === "") {
            console.warn(`Skipping TTS for empty translated text at index ${index} (original: "${originalCaption.text}")`);
            ttsRequestsPending--;
            if (ttsRequestsPending === 0 && audioQueue.length > 0) {
                playAudiosInSync(audioQueue);
            }
            return;
        }

        console.log(`Requesting TTS for: "${translatedText}" (original: "${originalCaption.text}")`);
        chrome.runtime.sendMessage(
          {
            action: "synthesizeSpeechAzure",
            text: translatedText,
            languageCode: ttsLanguageCode,
            voiceName: ttsVoiceName
          },
          ttsResponse => {
            ttsRequestsPending--;
            if (chrome.runtime.lastError) {
              console.error(`Error sending/receiving from background (synthesizeSpeechAzure for text "${translatedText}"):`, chrome.runtime.lastError.message);
            } else if (ttsResponse.error) {
              console.error(`Azure TTS API Error for text "${translatedText}":`, ttsResponse.error);
            } else if (ttsResponse.audioDataUri) {
              const audio = new Audio(ttsResponse.audioDataUri);
              audioQueue.push({
                audio: audio,
                startTime: originalCaption.start,
                duration: originalCaption.dur,
                translatedText: translatedText, // Keep for potential display
                originalText: originalCaption.text, // Keep for logging/debug
                played: false
              });
              console.log(`Audio prepared for caption at ${originalCaption.start}s: "${translatedText}"`);
            } else {
              console.warn(`No audioDataUri received for TTS of "${translatedText}"`, ttsResponse);
            }

            if (ttsRequestsPending === 0) {
              if (audioQueue.length > 0) {
                console.log(`All TTS responses received. ${audioQueue.length} audio items queued.`);
                playAudiosInSync(audioQueue);
              } else {
                console.log("All TTS responses received, but no audio items were successfully queued.");
              }
            }
          }
        );
      });
    }
  );
}


function detectYouTubeAndInjectButton() {
  if (window.location.hostname.includes("youtube.com") && window.location.pathname.includes("/watch")) {
    console.log("YouTube video page detected.");
    if (document.getElementById('translateYouTubeCaptionsBtn')) {
      console.log("Translate YouTube Captions button already exists.");
      return;
    }

    const button = document.createElement('button');
    button.id = 'translateYouTubeCaptionsBtn';
    button.textContent = 'Translate YouTube Captions (Immersive)';
    button.style.backgroundColor = '#FF5722'; // Changed color
    button.style.color = 'white';
    button.style.padding = '10px 15px';
    button.style.border = 'none';
    button.style.borderRadius = '4px';
    button.style.cursor = 'pointer';
    button.style.marginTop = '10px';
    button.style.marginLeft = '10px';
    button.style.zIndex = '10001'; // Ensure it's on top

    const videoActions = document.getElementById('below') || document.getElementById('actions') || document.getElementById('meta-contents') || document.querySelector('.ytd-video-primary-info-renderer');
    if (videoActions) {
        const container = videoActions.querySelector('#top-row.ytd-video-secondary-info-renderer') || videoActions.querySelector('#actions-inner') || videoActions;
        if(container) {
            container.appendChild(button);
             console.log("Translate YouTube Captions button injected.");
        } else {
            videoActions.appendChild(button);
            console.log("Translate YouTube Captions button injected (fallback).");
        }
    } else {
      console.warn("Could not find a suitable place to inject the YouTube caption button. Appending to body.");
      document.body.appendChild(button);
    }

    button.addEventListener('click', handleYouTubeCaptionTranslation);
  }
}

chrome.runtime.onMessage.addListener(function(request, sender, sendResponseToPopup) {
  if (request.action === "translate") {
    if (window.location.hostname.includes("youtube.com") && 
        window.location.pathname.includes("/watch") &&
        document.getElementById('translateYouTubeCaptionsBtn')) {
      console.log("Popup translate clicked on YouTube page. Use the 'Translate YouTube Captions' button instead.");
      sendResponseToPopup({ status: "Use YouTube captions button", info: "Please use the dedicated button on the page for YouTube caption translation." });
      return false;
    }

    console.log("Received translate message from popup (generic page).");
    removePreviousTranslations();
    const elementsToTranslate = extractTextAndElements();
    console.log("Elements to translate (generic page):", elementsToTranslate);

    if (elementsToTranslate.length === 0) {
      console.log("No text found to translate on generic page.");
      sendResponseToPopup({ status: "No text found to translate.", count: 0 });
      return false; 
    }

    const textsToTranslateArray = elementsToTranslate.map(item => item.text);
    const targetLanguage = "zh-Hans"; 

    console.log(`Requesting translation for ${textsToTranslateArray.length} texts to ${targetLanguage} (generic page).`);

    chrome.runtime.sendMessage(
      { action: "translateMicrosoft", texts: textsToTranslateArray, targetLanguage: targetLanguage },
      function(responseFromBackground) {
        // ... (rest of generic page translation logic remains the same) ...
        if (chrome.runtime.lastError) {
          console.error("Error sending/receiving from background (generic page):", chrome.runtime.lastError.message);
          sendResponseToPopup({ status: "Error communicating with background.", error: chrome.runtime.lastError.message });
          return;
        }
        if (responseFromBackground.error) {
          console.error("Translation API Error (generic page):", responseFromBackground.error);
          sendResponseToPopup({ status: "Translation failed.", error: responseFromBackground.error, count: 0 });
          return;
        }
        if (responseFromBackground.translatedTexts && responseFromBackground.translatedTexts.length === elementsToTranslate.length) {
          elementsToTranslate.forEach((item, index) => {
            const translatedText = responseFromBackground.translatedTexts[index];
            let translatedElement = document.createElement('div');
            translatedElement.textContent = translatedText;
            translatedElement.classList.add('immersive-translate-clone');
            translatedElement.style.color = 'blue'; 
            if (item.originalElement.parentNode) {
              item.originalElement.parentNode.insertBefore(translatedElement, item.originalElement.nextSibling);
            } else {
              document.body.appendChild(translatedElement);
            }
          });
          sendResponseToPopup({ status: "Page content translated and displayed.", count: elementsToTranslate.length });
        } else {
          sendResponseToPopup({ status: "Translation data mismatch.", error: "Mismatch or no translated texts.", count: 0 });
        }
      }
    );
    return true; 
  }
});

detectYouTubeAndInjectButton();
document.addEventListener('yt-navigate-finish', function() {
    console.log('YouTube navigation event detected (yt-navigate-finish). Re-checking for button.');
    setTimeout(detectYouTubeAndInjectButton, 500);
});
