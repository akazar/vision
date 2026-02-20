/**
 * Single configuration object for the v4 app
 */
const CONFIG = {
    recognition: {
        classes: ['person', 'dog', 'car'],
        threshold: 0.5,
        intervalMs: 500
    },
    model: {
        baseOptions: {
            modelAssetPath: "https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite2/float16/1/efficientdet_lite2.tflite",
            delegate: "GPU",
        },
        scoreThreshold: 0.5
    },
    api: {
        baseUrl: 'http://localhost:3001',
        describePrompt: 'Describe this image in detail. What objects, people, or scene do you see?'
    },
    downloadResultImage: true,
    boundingBoxStyles: {
        strokeStyle: '#00FFAA',
        lineWidth: 3,
        shadowColor: 'rgba(0, 0, 0, 0.5)',
        shadowBlur: 4,
        font: '16px system-ui, -apple-system, sans-serif',
        labelBgColor: 'rgba(0, 0, 0, 0.8)',
        labelTextColor: '#00FFAA',
        labelPadding: 6,
        borderRadius: 4
    },
    recognitionActionFunctions: [
        (recognitionResults) => {
            if (recognitionResults && recognitionResults.length > 0) {
                console.log(`[Recognition Action] Detected ${recognitionResults.length} object(s)`);
            }
        }        
    ],
    regularActionFunctions: [
        {
            func: (recognitionResults) => {
                if (recognitionResults && recognitionResults.length > 0) {
                    console.log(`[Regular Action] Detected ${recognitionResults.length} object(s)`);
                }
            },
            intervalMs: 15000
        },
        {
            func: (recognitionResults) => {
                const persons = recognitionResults.filter(result =>
                    result.class.toLowerCase().includes('person')
                );
                if (persons.length > 0) {
                    console.log(`[Regular Action] Found ${persons.length} person(s)`);
                }
                return { persons };
            },
            intervalMs: 18000
        },
        {
            func: (recognitionResults) => {
                const counts = {};
                recognitionResults.forEach(result => {
                    const className = result.class;
                    counts[className] = (counts[className] || 0) + 1;
                });
                console.log('[Regular Action] Object counts:', counts);
                return { counts };
            },
            intervalMs: 12000
        },
        // {
        //     func: async (recognitionResults) => {
        //         if (!recognitionResults?.length) return;
        //         const firstWithImage = recognitionResults.find(r => r.image);
        //         if (!firstWithImage?.image) return;
        //         try {
        //             const res = await fetch(`${CONFIG.api.baseUrl}/api/describe`, {
        //                 method: 'POST',
        //                 headers: { 'Content-Type': 'application/json' },
        //                 body: JSON.stringify({
        //                     image: firstWithImage.image,
        //                     prompt: CONFIG.api.describePrompt
        //                 })
        //             });
        //             const data = await res.json();
        //             console.log('[Action] Recognition results:', recognitionResults);
        //             if (data.success) {
        //                 console.log('[Regular Action] OpenAI description:', data.description);
        //                 console.log('[Regular Action] Model:', data.model, 'Usage:', data.usage);
        //             } else {
        //                 console.error('[Regular Action] OpenAI error:', data.error, data.details || '');
        //             }
        //             return data;
        //         } catch (err) {
        //             console.error('[Regular Action] OpenAI request failed:', err.message);
        //             return { error: err.message };
        //         }
        //     },
        //     intervalMs: 12000
        // }
    ],
    manualRecognitionActionFunctions: [
        (recognitionResults) => {
            if (recognitionResults && recognitionResults.length > 0) {
                console.log(`[Manual Recognition Action] Detected ${recognitionResults.length} object(s)`);
            }
        },
        (recognitionResults) => {
            if (recognitionResults && recognitionResults.length > 0) {
                console.log('[Manual Recognition Action] Detected:', recognitionResults);
            }
        }          
    ],
    serverReasoningActionFunctions: [
        (description) => {
            console.log('[Server Recognition Action] Description:', description);
        }
    ],
    serverRegularActionFunctions: [
        // {
        //     func: (description) => {
        //         console.log('[Server Regular Action] Description:', description);
        //     },
        //     intervalMs: 15000
        // }
    ],
};

export default CONFIG;
export { CONFIG };
