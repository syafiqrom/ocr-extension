// ---- Adjust these for the real system ----
const SEARCH_INPUT = 'input[data-col="doNo"]';  // the Customer DO search box
const ROW_SELECTOR = "tbody tr";                // rows of the data table
const CHECKBOX = 'input[type="checkbox"]';      // checkbox inside a row
const DO_CELL_INDEX = 2;                        // Customer DO is the 3rd cell (0-based)
const TIMEOUT_MS = 4000;
// ------------------------------------------

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Works with React/Angular/Vue too, not only plain inputs
function setValue(input, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
}

// Only rows that have a checkbox (skips the "No match" row)
function dataRows() {
    return [...document.querySelectorAll(ROW_SELECTOR)].filter(tr => tr.querySelector(CHECKBOX));
}

function matchingRows(number) {
    return dataRows().filter(tr => {
        const cell = tr.cells[DO_CELL_INDEX];
        return cell && cell.textContent.trim() === number;
    });
}

async function fill(number) {
    const input = document.querySelector(SEARCH_INPUT);
    if (!input) return { ok: false, reason: "search box not found" };

    try {
        setValue(input, number);

        // Wait until exactly one row is left and it is the right one (stable for 2 checks)
        let stable = 0;
        const start = Date.now();
        while (Date.now() - start < TIMEOUT_MS) {
            await sleep(100);
            if (dataRows().length === 1 && matchingRows(number).length === 1) {
                if (++stable >= 2) break;
            } else {
                stable = 0;
            }
        }

        if (stable < 2) {
            const n = dataRows().length;
            return { ok: false, reason: n === 0 ? "no match" : n + " rows matched" };
        }

        const box = matchingRows(number)[0].querySelector(CHECKBOX);
        if (!box.checked) box.click();
        await sleep(150);

        // Re-check after the grid has had time to react
        const again = matchingRows(number)[0];
        if (!again || !again.querySelector(CHECKBOX).checked) {
            return { ok: false, reason: "could not tick checkbox" };
        }
        return { ok: true };
    } finally {
        setValue(input, ""); // clear the filter for the next number (ticks stay)
    }
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "ping") {
        sendResponse({ ok: true });
        return;
    }
    if (msg.type === "fill") {
        fill(msg.number).then(sendResponse);
        return true;
    }
});