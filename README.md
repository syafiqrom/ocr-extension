# DO Scanner Filler (Chrome Extension)

A Chrome extension that receives DO numbers scanned by the **DO Scanner** phone app and enters them into the DO page automatically. For each number it filters the grid, checks that exactly one row matches, and ticks that row's checkbox.

<img width="250" height="396" alt="image" src="https://github.com/user-attachments/assets/ace4f213-1f19-4ae4-a237-df735b2b1929" />


## Features

- Side panel with live **Pending**, **Done**, and **Failed** lists
- Types each number into the **Customer DO** search box
- Ticks the row only if exactly one row is left and its Customer DO equals the scanned number
- Never touches the select-all checkbox
- Numbers wait in the queue when the page is not open, and are processed once it is
- Skips numbers already marked done
- Clear button, and a secret code screen on first run
- Light and dark mode

## How it works

```
Phone app -> Firebase: lists/<code>/pending
                         |
              Side panel listens live
                         |
          Content script on the DO page:
          type number -> wait for 1 row -> verify -> tick checkbox
                         |
        Firebase: moved to done (or failed, with a reason)
```

## Installation (developer mode)

1. Download or clone this folder.
2. Open `chrome://extensions` and turn on **Developer mode**.
3. Click **Load unpacked** and select this folder.
4. Pin the extension and click its icon to open the side panel.

## Configuration

### 1. Page URL (set in two places)

Replace the example URL with your DO page address.

`manifest.json` (in both `host_permissions` and `content_scripts.matches`):

```json
"host_permissions": ["https://system.company.com/*", "https://<your-project>-default-rtdb.<region>.firebasedatabase.app/*"],
"content_scripts": [{ "matches": ["https://system.company.com/*"], "js": ["content.js"] }]
```

`settings.js`:

```js
const TARGET_URL = "https://system.company.com/*";
const DB_URL = "https://<your-project>-default-rtdb.<region>.firebasedatabase.app";
```

The URL in `settings.js` must match the one in `manifest.json`.

### 2. Page selectors

Edit the top of `content.js` to match your system's HTML:

```js
const SEARCH_INPUT = 'input[data-col="doNo"]';  // Customer DO search box
const ROW_SELECTOR = "tbody tr";                // rows of the data table
const CHECKBOX = 'input[type="checkbox"]';      // checkbox inside a row
const DO_CELL_INDEX = 2;                        // Customer DO is the 3rd cell (0-based)
```

To find them, right-click the element on the page, choose **Inspect**, and copy its `id`, `name`, or class.

### 3. Secret code

On first run, the side panel asks for the secret code. Paste the code shown by the phone app (**Code** button). It is stored locally with `chrome.storage.local`, and never in the source code.

## Usage

1. Open the DO page and reload it after installing or reloading the extension.
2. Open the side panel and enter your secret code.
3. Scan DO numbers with the phone.
4. Watch each number move from **Pending** to **Done**, with the row ticked on the page.

Keep the side panel open while processing. If it is closed, numbers simply wait in `pending`.

## Status messages

| Message | Meaning |
|---|---|
| Waiting for scans... | Connected, nothing to process |
| Open the DO page to continue... | No open tab matches the page URL |
| Can't reach the page. Reload the DO page. | The tab matches, but the content script is not loaded |
| Processing 8021... | A number is being entered |

## Failed reasons

| Reason | Meaning |
|---|---|
| `no match` | No row has that Customer DO |
| `N rows matched` | More than one row was left, so nothing was ticked |
| `search box not found` | The selector in `content.js` is wrong for this page |
| `could not tick checkbox` | The click did not register |

## Testing with a local HTML file

1. Set the URL to `file:///*` in `manifest.json` and `settings.js`.
2. In `chrome://extensions`, open the extension's **Details** and turn on **Allow access to file URLs**.
3. Reload the extension and the test page.

## Project structure

```
manifest.json     permissions, side panel, content script
background.js     opens the side panel when the icon is clicked
settings.js       page URL and database URL
sidepanel.html    side panel UI (Material 3 styling)
sidepanel.js      Firebase connection, queue, lists
content.js        fills the search box and ticks the row on the DO page
```

## Limitations

- Processing happens only while the side panel is open.
- The secret code is the only protection for your data. For wider use, add Firebase Authentication and stricter database rules.
- Selectors are specific to one page layout and need updating if the system changes.

## Security notes

- Host permissions are limited to your DO page and the Firebase database.
- Never publish your secret code or commit it to Git.

## Publishing (optional)

Publish through the Chrome Web Store as **Unlisted**, so only people with the link can install it. This needs a one-time developer registration fee.
