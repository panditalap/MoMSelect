# MoMSelect

**Mom's Own Multi-Select** — A production-ready, zero-dependency vanilla JavaScript multi-select component.

> ♥ *Dedicated to my mother. Built for everyone.*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-brightgreen.svg)](package.json)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-zero-orange.svg)]()

---

## ✨ Features

| Feature | Detail |
|---|---|
| 🔒 XSS Safe | No `innerHTML` — text nodes only |
| 🔍 Fuzzy Search | Multi-term AND matching with live highlight |
| 📦 Grouped Options | Organize options into labeled groups |
| ⌨️ Keyboard First | `↑↓` navigate · `Enter`/`Space` select · `Escape` close |
| 📱 Mobile Modal | Full-screen overlay on ≤768px, body scroll locked |
| 🔼 Smart Flip | Opens upward automatically when space below is tight |
| ♿ ARIA Accessible | Full `role`, `aria-selected`, `aria-expanded` support |
| 📋 Form Compatible | Works with native form submit and reset |
| 🎯 2D Array Input | Feed raw DB rows directly — no mapping needed |
| 🔌 UMD Module | Works as browser global, CommonJS, or AMD |
| 🧹 Zero Memory Leaks | `WeakMap` instances + `cleanupFunctions` pattern |
| 🔕 Silent Init | Pre-filled values never fire `onChange` |

---

## 🚀 Installation

### CDN (quickest)

```html
<!-- In <head> -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/alapandit/momselect@latest/dist/momselect.min.css">

<!-- Before </body> -->
<script src="https://cdn.jsdelivr.net/gh/alapandit/momselect@latest/dist/momselect.min.js"></script>
```

### npm

```bash
npm install momselect
```

```js
import MoMSelect from 'momselect';
import 'momselect/dist/momselect.min.css';
```

### Download

Grab `dist/momselect.min.js` and `dist/momselect.min.css` from this repo.

---

## 📖 Quick Start

### HTML

```html
<input type="text" id="mySelect" class="form-control" />
```

### JavaScript

```js
MoMSelect.init('#mySelect', [
  { label: 'Apple',  value: 'apple'  },
  { label: 'Banana', value: 'banana' },
  { label: 'Cherry', value: 'cherry' },
], {
  max: 3,
  placeholder: 'Pick up to 3 fruits…',
  onChange: (e) => console.log(e.selectedValues),
});
```

---

## 📚 Options Reference

### `MoMSelect.init(input, options, config)`

| Parameter | Type | Default | Description |
|---|---|---|---|
| `input` | `string\|HTMLElement` | — | CSS selector or DOM element |
| `options` | `Array` | — | Object array or 2D array (see below) |
| `config.max` | `number` | `Infinity` | Maximum number of selections |
| `config.placeholder` | `string` | `"Type to search…"` | Search input placeholder |
| `config.clearText` | `string` | `"Clear all"` | Clear button label |
| `config.noResultsText` | `string` | `"No results found"` | Empty search message |
| `config.labelCol` | `number` | `0` | 2D array: column index for label |
| `config.valueCol` | `number` | `0` | 2D array: column index for value |
| `config.groupCol` | `number` | `null` | 2D array: column index for group |
| `config.disabledCol` | `number` | — | 2D array: column index for disabled flag |
| `config.sortBy` | `string\|Array` | `"label"` | Sort field(s): `"label"`, `"value"`, `"group"` |
| `config.sortType` | `string` | `"asc"` | `"asc"` or `"desc"` |
| `config.onChange` | `Function` | — | Fires on every selection change |
| `config.onOpen` | `Function` | — | Fires when dropdown opens |
| `config.onClose` | `Function` | — | Fires when dropdown closes |

---

## 📥 Options Formats

### Object Array

```js
MoMSelect.init('#el', [
  { label: 'Mumbai',  value: 'mumbai',  group: 'India',  disabled: false },
  { label: 'London',  value: 'london',  group: 'UK' },
  { label: 'Retired', value: 'retired', disabled: true },
]);
```

### 2D Array (raw DB rows)

```js
MoMSelect.init('#el', [
  ['India',  'IN', 'Asia',   false],
  ['France', 'FR', 'Europe', false],
  ['Legacy', 'LG', 'Other',  true ],   // disabled
], {
  labelCol:    0,
  valueCol:    1,
  groupCol:    2,
  disabledCol: 3,
});
```

---

## 🎮 Programmatic API

### Static API (via `MoMSelect.*`)

```js
MoMSelect.getValue('#el');               // → ['apple', 'cherry']
MoMSelect.setValue('#el', ['apple']);    // set by array
MoMSelect.setValue('#el', 'apple,cherry'); // set by comma string
MoMSelect.clear('#el');                  // clear all selections
MoMSelect.reset('#el');                  // reset to init value
MoMSelect.disable('#el');               // disable the component
MoMSelect.enable('#el');                // re-enable
MoMSelect.updateOptions('#el', newOpts); // replace options list
MoMSelect.getProcessedOptions('#el');   // inspect parsed options
MoMSelect.getConfig('#el');             // read frozen config
MoMSelect.isInitialized('#el');         // → true/false
MoMSelect.destroy('#el');               // remove & clean up
```

### Instance API

```js
const instance = MoMSelect.init('#el', options, config);
// or
const instance = MoMSelect.get('#el');

instance.getValue();
instance.setValue(['apple']);
instance.clear();
instance.reset();
instance.disable();
instance.enable();
instance.updateOptions(newOptions);
instance.destroy();
```

---

## 📡 Events

### Callback style

```js
MoMSelect.init('#el', options, {
  onChange: (e) => {
    console.log(e.value);          // comma-separated string
    console.log(e.selectedValues); // array of selected values
    console.log(e.action);         // 'add' | 'remove' | 'clear' | 'set'
    console.log(e.label);          // label of changed option (add/remove)
  },
  onOpen:  (e) => console.log('Opened'),
  onClose: (e) => console.log('Closed'),
});
```

### DOM CustomEvent style

```js
document.querySelector('#el').addEventListener('momselect:onChange', (e) => {
  console.log(e.detail.selectedValues);
});
```

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|---|---|
| `↓` / `↑` | Navigate options |
| `Enter` | Toggle focused option |
| `Space` | Toggle focused option (when a row is focused) |
| `Escape` | Close dropdown |
| Any character | Open dropdown and start searching |
| `Backspace` | Open dropdown, clear search |

---

## 🌐 Browser Support

Works in all modern browsers: Chrome, Firefox, Safari, Edge.  
No polyfills needed. No transpilation required.

---

## 📁 Repository Structure

```
momselect/
├── dist/
│   ├── momselect.js        ← Full source (UMD)
│   ├── momselect.min.js    ← Minified JS  (~15KB)
│   ├── momselect.css       ← Full stylesheet
│   └── momselect.min.css   ← Minified CSS (~5KB)
├── demo/
│   └── index.html          ← Live demo page
├── LICENSE
├── package.json
└── README.md
```

---

## 🤝 Contributing

Issues and pull requests are welcome!  
Please open an issue first to discuss any major changes.

---

## 📄 License

[MIT](LICENSE) © Alap Pandit

---

*MoMSelect — Because the best code is built with love.*  
*♥ For Mom.*
