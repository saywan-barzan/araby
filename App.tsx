
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleGenAI, Type } from "@google/genai";
import type { VocabularyWord } from './types';
import { WordCard } from './components/WordCard';
import { Timer } from './components/Timer';
import { IconButton } from './components/IconButton';
import { useSpeechSynthesis } from './hooks/useSpeechSynthesis';
import { WordCardSkeleton } from './components/WordCardSkeleton';

const ChevronLeftIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6"></polyline>
  </svg>
);

const ChevronRightIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 18 15 12 9 6"></polyline>
  </svg>
);

const CloseIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18"></line>
    <line x1="6" y1="6" x2="18" y2="18"></line>
  </svg>
);

const App: React.FC = () => {
  if (!process.env.API_KEY) {
    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <div className="text-center text-red-400 bg-red-900/50 p-6 rounded-2xl max-w-md">
                <h2 className="text-xl font-bold mb-2">کلیلەکە ونە (API Key Missing)</h2>
                <p>
                    کلیلی APIی Gemini دیاری نەکراوە. تکایە دڵنیابە لەوەی کە گۆڕاوی ژینگەیی 
                    <code>process.env.API_KEY</code> 
                    بە دروستی ڕێکخراوە.
                </p>
            </div>
        </div>
    );
  }
  
  const [words, setWords] = useState<VocabularyWord[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [timeLeft, setTimeLeft] = useState<number>(2 * 60 * 60); // 2 hours

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isImageQuotaExceeded, setIsImageQuotaExceeded] = useState<boolean>(false);
  const [showQuotaBanner, setShowQuotaBanner] = useState<boolean>(true);
  
  const initialFetchInitiated = useRef(false);

  const { speak, isSpeaking } = useSpeechSynthesis();

  // Load state from localStorage on initial mount for robust persistence
  useEffect(() => {
    try {
      const savedWordsStr = localStorage.getItem('arabic-app-words');
      if (savedWordsStr) {
        const savedWords = JSON.parse(savedWordsStr);
        if (Array.isArray(savedWords) && savedWords.length > 0) {
          setWords(savedWords);
          
          const savedIndexStr = localStorage.getItem('arabic-app-currentIndex');
          const savedIndex = savedIndexStr ? parseInt(savedIndexStr, 10) : 0;
          if (!isNaN(savedIndex)) {
            // Ensure index is within bounds of the loaded words
            setCurrentIndex(Math.max(0, Math.min(savedIndex, savedWords.length - 1)));
          }
        }
      }

      const savedTimeStr = localStorage.getItem('arabic-app-timeLeft');
      if (savedTimeStr) {
        const savedTime = parseInt(savedTimeStr, 10);
        if (!isNaN(savedTime)) {
          setTimeLeft(savedTime);
        }
      }
    } catch (e) {
      console.error("Failed to load state from localStorage. Starting fresh.", e);
      // If loading fails, clear stored data to prevent future errors
      localStorage.removeItem('arabic-app-words');
      localStorage.removeItem('arabic-app-currentIndex');
      localStorage.removeItem('arabic-app-timeLeft');
    }
  }, []); // Empty dependency array ensures this runs only once on mount

  // Save state to localStorage whenever it changes
  useEffect(() => {
    try {
      if (words.length > 0) {
        // To prevent quota errors, trim older words' image data before saving
        const wordsToSave = words.map((word, index) => {
            // Keep images for the last 20 words, clear older ones to save space
            if (words.length - index > 20 && word.imageUrl !== 'failed') {
                return { ...word, imageUrl: '' };
            }
            return word;
        });
        localStorage.setItem('arabic-app-words', JSON.stringify(wordsToSave));
        localStorage.setItem('arabic-app-currentIndex', currentIndex.toString());
      } else {
        localStorage.removeItem('arabic-app-words');
        localStorage.removeItem('arabic-app-currentIndex');
      }
      localStorage.setItem('arabic-app-timeLeft', timeLeft.toString());
    } catch (err) {
      console.error("Failed to save state to localStorage.", err);
      if (err instanceof DOMException && (err.name === 'QuotaExceededError' || err.name === 'NS_ERROR_DOM_QUOTA_REACHED')) {
        alert("کێشەیەک لە پاشەکەوتکردنی داتاکان ڕوویدا. ڕەنگە بیرگەی ناوخۆیی پڕ بووبێت. (Could not save new words. Storage might be full.)");
      }
    }
  }, [words, currentIndex, timeLeft]);

  // Timer countdown effect
  useEffect(() => {
    if (timeLeft <= 0) return;
    const timerId = setInterval(() => {
      setTimeLeft(prevTime => prevTime - 1);
    }, 1000);
    return () => clearInterval(timerId);
  }, [timeLeft]);

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

  const fetchNewWord = useCallback(async (advanceIndex: boolean = true) => {
    if (isLoading) return;
    setIsLoading(true);
    setError(null);
    
    try {
      const existingWords = words.slice(-50).map(w => w.arabicWord).join(', ') || 'none';
      
      const schema = {
        type: Type.OBJECT,
        properties: {
          arabicWord: { type: Type.STRING, description: 'A common, single Iraqi Arabic word, fully vocalized with diacritics (Tashkeel).' },
          pronunciation: { type: Type.STRING, description: 'A simple, Latin-based phonetic spelling of the word.' },
          kurdishWord: { type: Type.STRING, description: 'The Kurdish (Sorani) translation of the word.' },
          arabicSentence: { type: Type.STRING, description: 'An example sentence using the word in Iraqi Arabic, fully vocalized with diacritics (Tashkeel).' },
          kurdishSentence: { type: Type.STRING, description: 'The Kurdish (Sorani) translation of the sentence.' },
          imagePrompt: { type: Type.STRING, description: 'A detailed, photorealistic English prompt for an image generation AI to create a picture representing the word. Example for "چای" (tea): "A photorealistic close-up of a traditional steaming glass of Iraqi tea on a decorative saucer."' }
        },
        required: ['arabicWord', 'pronunciation', 'kurdishWord', 'arabicSentence', 'kurdishSentence', 'imagePrompt']
      };

      const textResponse = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: `Generate a new, common Iraqi Arabic word for a Kurdish speaker. The generated Arabic word and example sentence must be fully vocalized with diacritics (Tashkeel). Avoid these words: ${existingWords}.`,
        config: {
          responseMimeType: "application/json",
          responseSchema: schema,
        }
      });
      
      let jsonText = textResponse.text.trim();
      if (jsonText.startsWith("```json")) {
        jsonText = jsonText.substring(7, jsonText.length - 3).trim();
      } else if (jsonText.startsWith("```")) {
        jsonText = jsonText.substring(3, jsonText.length - 3).trim();
      }
      
      let newWordData;
      try {
        newWordData = JSON.parse(jsonText);
      } catch (parseError) {
        console.error("Failed to parse JSON from model response:", parseError, "Raw response:", textResponse.text);
        throw new Error("Model returned a response in an invalid format.");
      }

      if (!newWordData || !newWordData.imagePrompt) {
          throw new Error("Model returned incomplete data.");
      }

      let imageUrl = '';
      if (!isImageQuotaExceeded) {
          try {
            const imageResponse = await ai.models.generateImages({
              model: 'imagen-3.0-generate-002',
              prompt: newWordData.imagePrompt,
              config: {
                numberOfImages: 1,
                outputMimeType: 'image/jpeg',
                aspectRatio: '4:3',
              },
            });
            
            if (imageResponse.generatedImages && imageResponse.generatedImages.length > 0) {
                const base64Image = imageResponse.generatedImages[0].image.imageBytes;
                imageUrl = `data:image/jpeg;base64,${base64Image}`;
            } else {
                console.warn("Image generation returned no images.");
                imageUrl = 'failed';
            }
          } catch (imgErr: any) {
              console.error("Image generation failed:", imgErr);
              imageUrl = 'failed';
              if (imgErr.message && String(imgErr.message).toLowerCase().includes('quota')) {
                  setIsImageQuotaExceeded(true);
                  setShowQuotaBanner(true);
              }
          }
      }
      
      const newWord: VocabularyWord = {
        id: Date.now(),
        arabicWord: newWordData.arabicWord,
        pronunciation: newWordData.pronunciation,
        kurdishWord: newWordData.kurdishWord,
        arabicSentence: newWordData.arabicSentence,
        kurdishSentence: newWordData.kurdishSentence,
        imageUrl: imageUrl,
      };
      
      setWords(prevWords => [...prevWords, newWord]);
      if (advanceIndex) {
        setCurrentIndex(prevIndex => prevIndex + 1);
      }

    } catch (err) {
      console.error("Failed to fetch new word:", err);
      setError("کێشەیەک لە وەرگرتنی وشەی نوێدا ڕوویدا. تکایە هەوڵبدەرەوە.");
    } finally {
      setIsLoading(false);
    }
  }, [words, isLoading, ai, isImageQuotaExceeded]);

  // Fetch initial word if the list is empty after attempting to load from storage.
  useEffect(() => {
    if (words.length === 0 && !isLoading && !initialFetchInitiated.current) {
      initialFetchInitiated.current = true;
      fetchNewWord(false);
    }
  }, [words.length, isLoading, fetchNewWord]);

  const handleNext = useCallback(() => {
    if (currentIndex === words.length - 1) {
      fetchNewWord(true);
    } else {
      setCurrentIndex(prevIndex => prevIndex + 1);
    }
  }, [currentIndex, words.length, fetchNewWord]);

  const handlePrevious = useCallback(() => {
    setCurrentIndex(prevIndex => (prevIndex > 0 ? prevIndex - 1 : 0));
  }, []);

  const currentWord: VocabularyWord | undefined = words[currentIndex];

  const handleSpeakWord = useCallback(() => {
    if (currentWord) speak(currentWord.arabicWord);
  }, [currentWord, speak]);

  const handleSpeakSentence = useCallback(() => {
    if (currentWord) speak(currentWord.arabicSentence);
  }, [currentWord, speak]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 selection:bg-cyan-500 selection:text-white">
      <div className="w-full max-w-lg mx-auto">
        <header className="flex justify-between items-center mb-6 px-2">
          <h1 className="text-2xl md:text-3xl font-bold text-cyan-300 tracking-wide">
            فێربوونی عەرەبی
          </h1>
          <Timer seconds={timeLeft} />
        </header>

        {isImageQuotaExceeded && showQuotaBanner && (
            <div className="bg-amber-800/50 border border-amber-700 text-amber-200 p-3 rounded-xl mb-4 flex justify-between items-center" role="alert" dir="rtl">
                <div>
                    <p className="font-semibold">سنووری وێنە بەکارهێنرا (Image Limit Reached)</p>
                    <p className="text-amber-300 mt-1 text-sm">
                        تایبەتمەندی دروستکردنی وێنە تاقیکارییە و سنووری بەکارهێنانی ڕۆژانەی هەیە. فێربوون بەبێ وێنە بەردەوام دەبێت.
                    </p>
                </div>
                <button 
                    onClick={() => setShowQuotaBanner(false)} 
                    className="p-1 mr-3 rounded-full hover:bg-amber-700/50 transition-colors flex-shrink-0"
                    aria-label="داخستنی ئاگاداری (Dismiss notification)"
                >
                    <CloseIcon />
                </button>
            </div>
        )}

        <main className="min-h-[600px] flex items-center justify-center">
          {isLoading && !currentWord ? (
            <WordCardSkeleton />
          ) : error ? (
            <div className="text-center text-red-400 bg-red-900/50 p-6 rounded-2xl">{error}</div>
          ) : currentWord ? (
            <WordCard 
              key={currentWord.id}
              word={currentWord} 
              onSpeakWord={handleSpeakWord}
              onSpeakSentence={handleSpeakSentence}
              isSpeaking={isSpeaking}
            />
          ) : (
             <WordCardSkeleton />
          )}
        </main>

        <footer className="mt-8 flex items-center justify-center space-x-6">
          <IconButton onClick={handlePrevious} aria-label=" وشەی پێشوو (Previous Word)" disabled={currentIndex === 0 || isLoading}>
            <ChevronLeftIcon />
          </IconButton>
          <div className="text-slate-300 font-mono text-lg py-2 px-6 bg-slate-800/50 rounded-full border border-slate-700 w-28 text-center">
            {isLoading && currentIndex >= words.length -1 ? "..." : `${currentIndex + 1} / ${words.length || '...'}`}
          </div>
          <IconButton onClick={handleNext} aria-label="وشەی دواتر (Next Word)" disabled={isLoading}>
            <ChevronRightIcon />
          </IconButton>
        </footer>
      </div>
    </div>
  );
};

export default App;
