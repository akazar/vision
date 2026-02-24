(function () {
    'use strict';

    const form = document.getElementById('configForm');

    function indentBlock(text, spaces) {
        const pad = ' '.repeat(spaces);
        return text
            .split('\n')
            .map(line => (line.trim() === '' ? '' : pad + line))
            .join('\n');
    }

    function escapeForSingleQuotedJs(str) {
        return str
            .replace(/\\/g, '\\\\')
            .replace(/'/g, "\\'")
            .replace(/\n/g, '\\n')
            .replace(/\r/g, '\\r');
    }

    function formatClassesArray(arr) {
        return '[\n            ' + arr.map(s => "'" + escapeForSingleQuotedJs(s) + "'").join(',\n            ') + '\n        ]';
    }

    function isSectionEnabled(id) {
        const el = document.getElementById(id);
        return el ? el.checked : true;
    }

    function buildConfigJs() {
        const useRecognition = isSectionEnabled('useRecognition');
        const useModel = isSectionEnabled('useModel');
        const useApi = isSectionEnabled('useApi');
        const useOptions = isSectionEnabled('useOptions');
        const useBoundingBoxStyles = isSectionEnabled('useBoundingBoxStyles');
        const useRecognitionActionFunctions = isSectionEnabled('useRecognitionActionFunctions');
        const useRegularActionFunctions = isSectionEnabled('useRegularActionFunctions');
        const useManualRecognitionActionFunctions = isSectionEnabled('useManualRecognitionActionFunctions');
        const useServerReasoningActionFunctions = isSectionEnabled('useServerReasoningActionFunctions');
        const useServerRegularActionFunctions = isSectionEnabled('useServerRegularActionFunctions');

        let recognitionStr = 'null';
        if (useRecognition) {
            const classesInput = document.getElementById('classes').value;
            const classes = classesInput.split(',').map(s => s.trim()).filter(Boolean);
            if (classes.length === 0) classes.push('person');
            const threshold = parseFloat(document.getElementById('threshold').value) || 0.5;
            const intervalMs = parseInt(document.getElementById('intervalMs').value, 10) || 500;
            recognitionStr = `{
        classes: ${formatClassesArray(classes)},
        threshold: ${threshold},
        intervalMs: ${intervalMs}
    }`;
        }

        let modelStr = 'null';
        if (useModel) {
            const modelAssetPath = document.getElementById('modelAssetPath').value.trim() ||
                'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite2/float16/1/efficientdet_lite2.tflite';
            const delegate = (document.getElementById('delegate').value || 'GPU').replace(/"/g, '\\"');
            const scoreThreshold = parseFloat(document.getElementById('scoreThreshold').value) || 0.5;
            modelStr = `{
        baseOptions: {
            modelAssetPath: "${modelAssetPath.replace(/"/g, '\\"')}",
            delegate: "${delegate}",
        },
        scoreThreshold: ${scoreThreshold}
    }`;
        }

        let apiStr = 'null';
        if (useApi) {
            const baseUrl = document.getElementById('baseUrl').value.trim() || 'http://localhost:3001';
            const describePrompt = document.getElementById('describePrompt').value.trim() ||
                'Describe this image in detail. What objects, people, or scene do you see?';
            apiStr = `{
        baseUrl: '${baseUrl.replace(/'/g, "\\'")}',
        describePrompt: '${escapeForSingleQuotedJs(describePrompt)}'
    }`;
        }

        const downloadResultImage = useOptions ? document.getElementById('downloadResultImage').checked : false;

        let boundingBoxStylesStr = 'null';
        if (useBoundingBoxStyles) {
            boundingBoxStylesStr = `{
        strokeStyle: '${(document.getElementById('strokeStyle').value || '#00FFAA').replace(/'/g, "\\'")}',
        lineWidth: ${parseInt(document.getElementById('lineWidth').value, 10) || 3},
        shadowColor: '${(document.getElementById('shadowColor').value || 'rgba(0, 0, 0, 0.5)').replace(/'/g, "\\'")}',
        shadowBlur: ${parseInt(document.getElementById('shadowBlur').value, 10) || 4},
        font: '${(document.getElementById('font').value || '16px system-ui, -apple-system, sans-serif').replace(/'/g, "\\'")}',
        labelBgColor: '${(document.getElementById('labelBgColor').value || 'rgba(0, 0, 0, 0.8)').replace(/'/g, "\\'")}',
        labelTextColor: '${(document.getElementById('labelTextColor').value || '#00FFAA').replace(/'/g, "\\'")}',
        labelPadding: ${parseInt(document.getElementById('labelPadding').value, 10) || 6},
        borderRadius: ${parseInt(document.getElementById('borderRadius').value, 10) || 4}
    }`;
        }

        let recognitionActionFunctionsStr = '[]';
        if (useRecognitionActionFunctions) {
            const bodies = Array.from(document.querySelectorAll('#recognitionActions .action-body'))
                .map(el => el.value.trim())
                .filter(Boolean);
            if (bodies.length > 0) {
                recognitionActionFunctionsStr = '[\n' + bodies.map((body, i) => {
                    const indented = indentBlock(body, 8);
                    return `        (recognitionResults) => {\n${indented}\n        }${i < bodies.length - 1 ? ',' : ''}`;
                }).join('\n') + '\n    ]';
            }
        }

        let regularActionFunctionsStr = '[]';
        if (useRegularActionFunctions) {
            const regularActionRows = document.querySelectorAll('#regularActions .action-row');
            const regularActions = Array.from(regularActionRows).map(row => {
                const body = row.querySelector('.action-body').value.trim();
                const intervalInput = row.querySelector('.interval-ms');
                const intervalMs = intervalInput ? (parseInt(intervalInput.value, 10) || 15000) : 15000;
                return { body, intervalMs };
            }).filter(a => a.body.length > 0);
            if (regularActions.length > 0) {
                regularActionFunctionsStr = '[\n' + regularActions.map((a, i) => {
                    const indented = indentBlock(a.body, 8);
                    return `        {
            func: (recognitionResults) => {\n${indented}\n            },
            intervalMs: ${a.intervalMs}
        }${i < regularActions.length - 1 ? ',' : ''}`;
                }).join('\n') + '\n    ]';
            }
        }

        let manualRecognitionActionFunctionsStr = '[]';
        if (useManualRecognitionActionFunctions) {
            const bodies = Array.from(document.querySelectorAll('#manualActions .action-body'))
                .map(el => el.value.trim())
                .filter(Boolean);
            if (bodies.length > 0) {
                manualRecognitionActionFunctionsStr = '[\n' + bodies.map((body, i) => {
                    const indented = indentBlock(body, 8);
                    return `        (recognitionResults) => {\n${indented}\n        }${i < bodies.length - 1 ? ',' : ''}`;
                }).join('\n') + '\n    ]';
            }
        }

        let serverReasoningActionFunctionsStr = '[]';
        if (useServerReasoningActionFunctions) {
            const bodies = Array.from(document.querySelectorAll('#serverReasoningActions .action-body'))
                .map(el => el.value.trim())
                .filter(Boolean);
            if (bodies.length > 0) {
                serverReasoningActionFunctionsStr = '[\n' + bodies.map((body, i) => {
                    const indented = indentBlock(body, 8);
                    return `        (description) => {\n${indented}\n        }${i < bodies.length - 1 ? ',' : ''}`;
                }).join('\n') + '\n    ]';
            }
        }

        let serverRegularActionFunctionsStr = '[]';
        if (useServerRegularActionFunctions) {
            const serverRegularRows = document.querySelectorAll('#serverRegularActions .action-row');
            const serverRegularActions = Array.from(serverRegularRows).map(row => {
                const body = row.querySelector('.action-body').value.trim();
                const intervalInput = row.querySelector('.interval-ms');
                const intervalMs = intervalInput ? (parseInt(intervalInput.value, 10) || 15000) : 15000;
                return { body, intervalMs };
            }).filter(a => a.body.length > 0);
            if (serverRegularActions.length > 0) {
                serverRegularActionFunctionsStr = '[\n' + serverRegularActions.map((a, i) => {
                    const indented = indentBlock(a.body, 8);
                    return `        {
            func: (description) => {\n${indented}\n            },
            intervalMs: ${a.intervalMs}
        }${i < serverRegularActions.length - 1 ? ',' : ''}`;
                }).join('\n') + '\n    ]';
            }
        }

        const out = `/**
 * Single configuration object for the v4 app
 */
const CONFIG = {
    recognition: ${recognitionStr},
    model: ${modelStr},
    api: ${apiStr},
    downloadResultImage: ${downloadResultImage},
    boundingBoxStyles: ${boundingBoxStylesStr},
    recognitionActionFunctions: ${recognitionActionFunctionsStr},
    regularActionFunctions: ${regularActionFunctionsStr},
    manualRecognitionActionFunctions: ${manualRecognitionActionFunctionsStr},
    serverReasoningActionFunctions: ${serverReasoningActionFunctionsStr},
    serverRegularActionFunctions: ${serverRegularActionFunctionsStr},
};

export default CONFIG;
export { CONFIG };
`;
        return out;
    }

    function addActionRow(containerId, withInterval) {
        const container = document.getElementById(containerId);
        const row = document.createElement('div');
        row.className = 'action-row' + (withInterval ? ' with-interval' : '');
        row.innerHTML = withInterval
            ? `<textarea class="action-body" rows="3" placeholder="console.log(recognitionResults);"></textarea>
               <div class="field interval-field">
                   <label>Interval (ms)</label>
                   <input type="number" class="interval-ms" value="15000" min="0">
               </div>
               <button type="button" class="btn-remove" title="Remove">−</button>`
            : `<textarea class="action-body" rows="2" placeholder="console.log(recognitionResults);"></textarea>
               <button type="button" class="btn-remove" title="Remove">−</button>`;
        container.appendChild(row);
        row.querySelector('.btn-remove').addEventListener('click', () => row.remove());
    }

    function downloadFile(content, filename) {
        const blob = new Blob([content], { type: 'application/javascript' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        a.click();
        URL.revokeObjectURL(a.href);
    }

    document.getElementById('addRecognitionAction').addEventListener('click', () =>
        addActionRow('recognitionActions', false));
    document.getElementById('addRegularAction').addEventListener('click', () =>
        addActionRow('regularActions', true));
    document.getElementById('addManualAction').addEventListener('click', () =>
        addActionRow('manualActions', false));
    document.getElementById('addServerReasoningAction').addEventListener('click', () =>
        addActionRow('serverReasoningActions', false));
    document.getElementById('addServerRegularAction').addEventListener('click', () =>
        addActionRow('serverRegularActions', true));

    document.querySelectorAll('#recognitionActions .btn-remove').forEach(btn => {
        btn.addEventListener('click', () => btn.closest('.action-row').remove());
    });
    document.querySelectorAll('#regularActions .btn-remove').forEach(btn => {
        btn.addEventListener('click', () => btn.closest('.action-row').remove());
    });
    document.querySelectorAll('#manualActions .btn-remove').forEach(btn => {
        btn.addEventListener('click', () => btn.closest('.action-row').remove());
    });
    document.querySelectorAll('#serverReasoningActions .btn-remove').forEach(btn => {
        btn.addEventListener('click', () => btn.closest('.action-row').remove());
    });

    form.addEventListener('submit', function (e) {
        e.preventDefault();
        const js = buildConfigJs();
        downloadFile(js, 'config.js');
    });
})();
