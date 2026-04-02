/*!
 * ================================================================
 *  MoMSelect v1.0.0 — Mom's Own Multi-Select
 *  Dedicated to my mother. Built for everyone.
 * ----------------------------------------------------------------
 *  A production-ready, zero-dependency multi-select component
 *  with enterprise-grade features and bulletproof architecture.
 *
 *  Features:
 *   1. XSS Safe (no innerHTML — text nodes only)
 *   2. Checkbox-based clarity (accessible & explicit)
 *   3. Fuzzy Search (multi-term AND matching)
 *   4. Multi-term Highlighting (safe <span> nodes)
 *   5. Keyboard-first UX (↑↓ Arrow / Enter / Space / Escape)
 *   6. Disabled Options (2D array & object support)
 *   7. Grouped Options
 *   8. Sorting (single or multi-level)
 *   9. Mobile Modal (full-screen overlay, body scroll locked)
 *  10. Smart Flip (opens upward when space below is tight)
 *  11. Native Form & Reset Compatibility
 *  12. Zero Dependencies — Pure JavaScript
 *  13. Static & Instance API
 *  14. Silent initialization — pre-filled values never fire onChange
 *
 *  @version  1.0.0
 *  @author   Alap Pandit
 *  @license  MIT
 *  @homepage https://github.com/alapandit/momselect
 * ================================================================
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    // CommonJS / Node
    module.exports = factory();
  } else if (typeof define === "function" && define.amd) {
    // AMD / RequireJS
    define(factory);
  } else {
    // Browser global
    root.MoMSelect = factory();
  }
}(typeof self !== "undefined" ? self : this, function () {

  "use strict";

  // ==================== CONSTANTS ====================

  /** Below this width, uses modal instead of dropdown */
  const MOBILE_BREAKPOINT = 768;

  /** Duration to show "Max selections" warning (ms) */
  const LIMIT_WARNING_DURATION = 2500;

  /** Debounce delay for search input (ms) */
  const FILTER_DEBOUNCE_DELAY = 100;


  // ==================== INSTANCE MANAGEMENT ====================

  /**
   * WeakMap: HTMLInputElement → instance API object.
   * Automatic GC when the element is removed from the DOM.
   * @type {WeakMap<HTMLElement, Object>}
   */
  const instances = new WeakMap();

  /** Global counter for unique DOM id prefixes */
  let globalId = 0;

  /** The close() of whichever instance is currently open */
  let currentlyOpenCloseFn = null;


  // ==================== MODULE-LEVEL HELPERS ====================

  function getInstance(input) {
    if (typeof input === "string") input = document.querySelector(input);
    if (!input) return null;
    return instances.get(input) || null;
  }

  function validateInstance(input) {
    const instance = getInstance(input);
    if (!instance) {
      const id = typeof input === "string"
        ? input
        : (input?.id ? `#${input.id}` : input?.tagName || String(input));
      throw new Error(`MoMSelect: not initialized for element: ${id}`);
    }
    return instance;
  }


  // ==================== INITIALIZATION ====================

  /**
   * Initialize MoMSelect on an input element.
   *
   * @param {string|HTMLElement} input
   * @param {Array}              options  - Object array or 2D array
   * @param {Object}             config
   * @param {number}   [config.max=Infinity]          - Max selections allowed
   * @param {string}   [config.placeholder]           - Search box placeholder
   * @param {string}   [config.clearText="Clear all"] - Clear button label
   * @param {string}   [config.noResultsText]         - Empty search message
   * @param {number}   [config.labelCol=0]            - 2D array: label column index
   * @param {number}   [config.valueCol=0]            - 2D array: value column index
   * @param {number}   [config.groupCol=null]         - 2D array: group column index
   * @param {number}   [config.disabledCol]           - 2D array: disabled column index
   * @param {string|Array} [config.sortBy='label']    - Sort field(s)
   * @param {string}   [config.sortType='asc']        - 'asc' | 'desc'
   * @param {Function} [config.onChange]              - Fires on selection change
   * @param {Function} [config.onOpen]               - Fires when dropdown opens
   * @param {Function} [config.onClose]              - Fires when dropdown closes
   * @returns {Object|null}
   */
  function init(input, options, config = {}) {
    if (typeof input === "string") input = document.querySelector(input);

    if (!input) {
      console.error("[MoMSelect] init: Invalid input element");
      return null;
    }
    if (!Array.isArray(options)) {
      console.error("[MoMSelect] init: Options must be an array");
      return null;
    }

    destroy(input);

    // ==================== CONFIGURATION ====================

    const max = config.max ?? Infinity;
    const placeholder = config.placeholder ?? "Type to search…";
    const clearText = config.clearText ?? "Clear all";
    const noResultsText = config.noResultsText ?? "No results found";
    const labelCol = config.labelCol ?? 0;
    const valueCol = config.valueCol ?? 0;
    const groupCol = config.groupCol ?? null;
    const disabledCol = config.disabledCol;
    const sortBy = config.sortBy ?? "label";
    const sortType = config.sortType ?? "asc";

    const eventHandlers = {
      onChange: config.onChange,
      onOpen: config.onOpen,
      onClose: config.onClose,
    };

    // ==================== INSTANCE STATE ====================

    const selected = new Set();
    const uniqueId = `mom-ms-${globalId++}`;
    const initialValue = input.value;
    const cleanupFunctions = [];

    let filterTimeout = null;
    let limitTimeout = null;
    let focusedIndex = -1;
    let selectedCycleIndex = 0;

    /**
     * INITIALIZATION GUARD
     * ─────────────────────
     * TRUE for the entire duration of init() — including the pre-fill step.
     * triggerEvent() returns immediately while true, so no event of any
     * kind (onChange, onOpen, onClose, native "change") can fire during init.
     *
     * Set to false once at the very end of init(). Never touched again.
     */
    let isInitializing = true;

    /**
     * Instance-scoped mouse tracker.
     * Prevents focusout from closing the dropdown when clicking inside
     * THIS instance. A module-level flag would cause cross-instance
     * interference when multiple selects exist on the same page.
     */
    let isClickingInside = false;


    // ==================== DATA PROCESSING ====================

    function isRowDisabled(row, colIndex) {
      const TRUTHY = new Set([true, 1, "true", "disabled"]);
      const FALSY = new Set([false, 0, "false", "enabled"]);

      if (colIndex !== undefined && row[colIndex] !== undefined) {
        return TRUTHY.has(row[colIndex]);
      }

      if (Array.isArray(row)) {
        const maxUsed = Math.max(
          labelCol !== undefined ? labelCol : -1,
          valueCol !== undefined ? valueCol : -1,
          groupCol != null ? groupCol : -1
        );
        for (let i = maxUsed + 1; i < row.length; i++) {
          if (TRUTHY.has(row[i])) return true;
          if (FALSY.has(row[i])) return false;
        }
      }
      return false;
    }

    /**
     * Shared option structure builder.
     * Both 2D-array and object-array paths funnel through here.
     */
    function buildOptionStructure(rawItems, normalize) {
      const groups = {};
      const flatOptions = [];

      rawItems.forEach(item => {
        const opt = normalize(item);
        if (!opt.label || !opt.value) return;

        if (opt.group) {
          if (!groups[opt.group]) groups[opt.group] = [];
          groups[opt.group].push(opt);
        } else {
          flatOptions.push(opt);
        }
      });

      const result = [];
      Object.keys(groups).sort().forEach(group => {
        result.push({ group, options: sortOptions(groups[group]) });
      });
      result.push(...sortOptions(flatOptions));
      return result;
    }

    function processOptions(rawOptions) {
      if (!Array.isArray(rawOptions) || !rawOptions.length) return [];

      const first = rawOptions[0];

      if (Array.isArray(first) && !first.label && !first.value) {
        return buildOptionStructure(rawOptions, row => ({
          label: row[labelCol] != null ? String(row[labelCol]) : "",
          value: row[valueCol] != null ? String(row[valueCol]) : "",
          group: groupCol !== null && row[groupCol] != null
            ? String(row[groupCol]) : null,
          disabled: isRowDisabled(row, disabledCol),
        }));
      }

      if (first.label || first.value) {
        return buildOptionStructure(rawOptions, item => ({
          label: item.label || item.text || item.name || "",
          value: item.value || "",
          group: item.group || null,
          disabled: item.disabled || false,
        }));
      }

      console.warn("[MoMSelect] Unrecognized options format.");
      return [];
    }

    function getFieldVal(opt, criterion) {
      return criterion === "group" ? (opt.group || "") : (opt[criterion] || "");
    }

    function sortOptions(opts) {
      if (!opts || !opts.length) return opts;
      const order = sortType === "desc" ? -1 : 1;
      const criteria = Array.isArray(sortBy) ? sortBy : [sortBy];
      return [...opts].sort((a, b) => {
        for (const c of criteria) {
          const av = getFieldVal(a, c);
          const bv = getFieldVal(b, c);
          if (av < bv) return -1 * order;
          if (av > bv) return 1 * order;
        }
        return 0;
      });
    }

    let processedOptions = processOptions(options);


    // ==================== DOM STRUCTURE ====================

    const wrapper = document.createElement("div");
    wrapper.className = "mom-ms";

    const inputWrapper = document.createElement("div");
    inputWrapper.className = "mom-ms-input-wrapper";

    input.parentNode.insertBefore(wrapper, input);
    inputWrapper.appendChild(input);
    wrapper.appendChild(inputWrapper);

    const badge = document.createElement("span");
    badge.className = "mom-ms-badge";
    badge.textContent = "0";
    inputWrapper.appendChild(badge);

    const arrow = document.createElement("div");
    arrow.className = "mom-ms-arrow";
    inputWrapper.appendChild(arrow);

    const dropdown = document.createElement("div");
    dropdown.className = "mom-ms-dropdown";
    dropdown.id = `${uniqueId}-dropdown`;

    const searchWrapper = document.createElement("div");
    searchWrapper.className = "mom-ms-search-wrapper";

    const search = document.createElement("input");
    search.className = "mom-ms-search";
    search.placeholder = placeholder;
    search.type = "text";
    search.setAttribute("aria-label", "Search options");

    const jumpBtn = document.createElement("button");
    jumpBtn.type = "button";
    jumpBtn.className = "mom-ms-jump";
    jumpBtn.title = "Jump to selected";
    jumpBtn.textContent = ">>";
    jumpBtn.disabled = true;

    searchWrapper.append(search, jumpBtn);

    const optionsBox = document.createElement("div");
    optionsBox.className = "mom-ms-options";
    optionsBox.setAttribute("role", "listbox");
    optionsBox.setAttribute("aria-multiselectable", "true");

    const noResults = document.createElement("div");
    noResults.className = "mom-ms-no-results";
    noResults.textContent = noResultsText;

    const footer = document.createElement("div");
    footer.className = "mom-ms-footer";

    const limitNote = document.createElement("div");
    limitNote.className = "mom-ms-limit";
    limitNote.textContent = `Max ${max} selections`;

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.className = "mom-ms-clear";
    clearBtn.textContent = clearText;

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "mom-ms-close";
    closeBtn.textContent = "Done";

    footer.append(closeBtn, clearBtn, limitNote);

    const modalWrap = document.createElement("div");
    modalWrap.className = "mom-ms-modal";
    modalWrap.append(searchWrapper, optionsBox, noResults, footer);

    dropdown.append(modalWrap);
    wrapper.append(dropdown);


    // ==================== ARIA ====================

    input.setAttribute("role", "combobox");
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-haspopup", "listbox");
    input.setAttribute("aria-controls", dropdown.id);
    input.setAttribute("autocomplete", "off");

    const optionsBoxMousedownHandler = e => e.preventDefault();
    optionsBox.addEventListener("mousedown", optionsBoxMousedownHandler);
    cleanupFunctions.push(() =>
      optionsBox.removeEventListener("mousedown", optionsBoxMousedownHandler)
    );


    // ==================== EVENT SYSTEM ====================

    /**
     * Fire a user callback and a DOM CustomEvent.
     * isInitializing guard short-circuits all events during init.
     */
    function triggerEvent(eventName, detail = {}) {
      if (isInitializing) return;

      const payload = {
        target: input,
        value: input.value,
        selectedValues: getValueFromInstance(),
        ...detail,
      };

      if (typeof eventHandlers[eventName] === "function") {
        try {
          eventHandlers[eventName](payload);
        } catch (err) {
          console.error(`[MoMSelect] Error in ${eventName} handler:`, err);
        }
      }

      input.dispatchEvent(
        new CustomEvent(`momselect:${eventName}`, { detail: payload, bubbles: true })
      );
    }


    // ==================== OPTION RENDERING ====================

    const optionElements = [];

    function renderOptions(optionsData) {
      optionsBox.innerHTML = "";
      optionElements.length = 0;

      for (let i = cleanupFunctions.length - 1; i >= 0; i--) {
        if (cleanupFunctions[i]._isRowCleanup) cleanupFunctions.splice(i, 1);
      }

      optionsData.forEach((item, index) => {
        if (item.group && item.options) {
          const groupHeader = document.createElement("div");
          groupHeader.className = "mom-ms-group";
          groupHeader.textContent = item.group;
          groupHeader.dataset.isGroup = "true";
          optionsBox.append(groupHeader);

          item.options.forEach((opt, optIndex) =>
            renderSingleOption(opt, index * 1000 + optIndex)
          );
        } else {
          renderSingleOption(item, index);
        }
      });
    }

    function renderSingleOption(opt, uniqueIndex) {
      const row = document.createElement("label");
      row.className = "mom-ms-option";
      if (opt.disabled) row.classList.add("disabled");
      row.setAttribute("role", "option");
      row.setAttribute("aria-selected", "false");
      row.dataset.optionIndex = uniqueIndex;

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.value = opt.value;
      cb.dataset.index = uniqueIndex;
      cb.id = `${uniqueId}-option-${uniqueIndex}`;
      cb.setAttribute("tabindex", "-1");

      if (opt.disabled) {
        cb.disabled = true;
        cb.setAttribute("aria-disabled", "true");
      } else {
        cb.addEventListener("change", () => {
          if (cb.checked && selected.size >= max) {
            cb.checked = false;
            showLimit();
            return;
          }

          hideLimit();

          if (cb.checked) {
            selected.add(cb);
            row.setAttribute("aria-selected", "true");
          } else {
            selected.delete(cb);
            row.setAttribute("aria-selected", "false");
          }

          sync();
          triggerEvent("onChange", {
            action: cb.checked ? "add" : "remove",
            value: opt.value,
            label: opt.label,
          });
        });
      }

      const labelSpan = document.createElement("span");
      labelSpan.className = "mom-ms-label";
      labelSpan.textContent = " " + opt.label;

      row._labelText = opt.label;
      row._labelEl = labelSpan;

      row.append(cb, labelSpan);
      optionsBox.append(row);
      optionElements.push(row);

      const rowClickHandler = () => { focusedIndex = optionElements.indexOf(row); };
      row.addEventListener("click", rowClickHandler);

      const cleanup = () => row.removeEventListener("click", rowClickHandler);
      cleanup._isRowCleanup = true;
      cleanupFunctions.push(cleanup);
    }

    renderOptions(processedOptions);


    // ==================== CORE HELPERS ====================

    function getValueFromInstance() {
      return input.value ? input.value.split(", ").filter(Boolean) : [];
    }

    /**
     * Sync selected Set → input.value, badge, buttons.
     * Single source of truth for input.value.
     */
    function sync() {
      const values = [...selected]
        .sort((a, b) => Number(a.dataset.index) - Number(b.dataset.index))
        .map(cb => cb.value);

      const newValue = values.join(", ");
      const changed = input.value !== newValue;

      input.value = newValue;

      badge.textContent = selected.size;
      badge.classList.toggle("show", selected.size > 0);
      clearBtn.classList.toggle("show", selected.size > 0);
      jumpBtn.disabled = selected.size === 0;

      if (changed) {
        input.dispatchEvent(new CustomEvent("change", { bubbles: true }));
      }
    }

    function clearSelections() {
      const previousValues = getValueFromInstance();

      selected.clear();

      optionsBox.querySelectorAll("input[type='checkbox']").forEach(cb => {
        if (!cb.disabled) {
          cb.checked = false;
          cb.closest(".mom-ms-option")?.setAttribute("aria-selected", "false");
        }
      });

      hideLimit();
      sync();

      if (previousValues.length > 0) {
        triggerEvent("onChange", { action: "clear", previousValues });
      }
    }


    // ==================== DROPDOWN OPEN / CLOSE ====================

    function open() {
      if (input.disabled) return;

      if (currentlyOpenCloseFn && currentlyOpenCloseFn !== close) {
        currentlyOpenCloseFn();
      }
      currentlyOpenCloseFn = close;

      wrapper.classList.add("open");
      input.setAttribute("aria-expanded", "true");

      if (window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches) {
        // Mobile: full-screen modal, lock body scroll
        optionsBox.scrollTop = 0;
        document.body.style.overflow = "hidden";
      } else {
        // Desktop: smart flip — measure after paint so height is real
        requestAnimationFrame(() => {
          const rect = input.getBoundingClientRect();
          const spaceBelow = window.innerHeight - rect.bottom;
          const spaceAbove = rect.top;
          const dropdownHeight = dropdown.getBoundingClientRect().height;

          if (spaceBelow < dropdownHeight && spaceAbove > spaceBelow) {
            dropdown.style.top = "auto";
            dropdown.style.bottom = "calc(100% + 4px)";
          } else {
            dropdown.style.top = "calc(100% + 4px)";
            dropdown.style.bottom = "auto";
          }
        });
      }

      search.focus();
      focusedIndex = -1;
      selectedCycleIndex = 0;

      triggerEvent("onOpen");
    }

    function close() {
      document.body.style.overflow = "";
      dropdown.style.top = "";
      dropdown.style.bottom = "";
      wrapper.classList.remove("open");
      input.setAttribute("aria-expanded", "false");
      search.value = "";
      filter();
      focusedIndex = -1;
      removeFocus();

      triggerEvent("onClose");

      if (currentlyOpenCloseFn === close) currentlyOpenCloseFn = null;
    }


    // ==================== SEARCH & FILTER ====================

    function getSearchTerms(q) {
      return q.toLowerCase().trim().split(/\s+/).filter(Boolean);
    }

    function matchesSearch(text, terms) {
      const t = text.toLowerCase();
      return terms.every(term => t.includes(term));
    }

    function highlightText(container, originalText, terms) {
      container.textContent = "";

      if (!terms.length) {
        container.append(document.createTextNode(originalText));
        return;
      }

      const lower = originalText.toLowerCase();
      let pos = 0;

      while (pos < originalText.length) {
        let matchIndex = -1;
        let matchTerm = "";

        for (const term of terms) {
          const i = lower.indexOf(term, pos);
          if (i !== -1 && (matchIndex === -1 || i < matchIndex)) {
            matchIndex = i;
            matchTerm = term;
          }
        }

        if (matchIndex === -1) {
          container.append(document.createTextNode(originalText.slice(pos)));
          break;
        }

        if (matchIndex > pos) {
          container.append(document.createTextNode(originalText.slice(pos, matchIndex)));
        }

        const mark = document.createElement("span");
        mark.className = "mom-ms-highlight";
        mark.textContent = originalText.slice(matchIndex, matchIndex + matchTerm.length);
        container.append(mark);

        pos = matchIndex + matchTerm.length;
      }
    }

    function filter() {
      const terms = getSearchTerms(search.value);
      let visibleCount = 0;

      optionsBox.style.display = "none";

      optionsBox.querySelectorAll(".mom-ms-option").forEach(el => {
        const text = el._labelText || el.textContent;
        const match = matchesSearch(text, terms);
        el.style.display = match ? "" : "none";

        if (match) {
          visibleCount++;
          if (el._labelEl) highlightText(el._labelEl, " " + el._labelText, terms);
        }
      });

      optionsBox.querySelectorAll(".mom-ms-group").forEach(el => {
        let hasVisible = false;
        let next = el.nextElementSibling;

        while (next && !next.classList.contains("mom-ms-group")) {
          if (next.classList.contains("mom-ms-option") && next.style.display !== "none") {
            hasVisible = true;
            break;
          }
          next = next.nextElementSibling;
        }

        el.style.display = hasVisible ? "" : "none";
      });

      optionsBox.style.display = "";
      noResults.classList.toggle("show", visibleCount === 0);

      focusedIndex = -1;
      removeFocus();
    }


    // ==================== LIMIT WARNING ====================

    function showLimit() {
      clearTimeout(limitTimeout);
      limitNote.classList.add("show");
      limitTimeout = setTimeout(() => hideLimit(), LIMIT_WARNING_DURATION);
    }

    function hideLimit() {
      clearTimeout(limitTimeout);
      limitNote.classList.remove("show");
    }


    // ==================== KEYBOARD NAVIGATION ====================

    function getVisibleOptions() {
      return optionElements.filter(el => el.style.display !== "none");
    }

    function setFocus(index) {
      const visible = getVisibleOptions();
      if (index < 0 || index >= visible.length) return;

      removeFocus();
      focusedIndex = index;
      visible[index].classList.add("focused");
      visible[index].scrollIntoView({ block: "nearest", behavior: "smooth" });
    }

    function removeFocus() {
      optionElements.forEach(el => el.classList.remove("focused"));
    }

    function toggleFocused() {
      const visible = getVisibleOptions();
      if (focusedIndex < 0 || focusedIndex >= visible.length) return;

      const cb = visible[focusedIndex].querySelector("input[type='checkbox']");
      if (cb && !cb.disabled) {
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event("change"));
      }
    }


    // ==================== EVENT HANDLERS ====================

    const arrowClickHandler = e => {
      e.preventDefault();
      e.stopPropagation();
      wrapper.classList.contains("open") ? close() : open();
    };
    arrow.addEventListener("click", arrowClickHandler);
    cleanupFunctions.push(() => arrow.removeEventListener("click", arrowClickHandler));

    const inputKeydownHandler = e => {
      if (wrapper.classList.contains("open")) {
        if (e.key === "Escape") {
          close(); input.focus(); e.preventDefault();
        } else if (e.key === "Enter") {
          e.preventDefault(); toggleFocused();
        }
      } else {
        if (e.key === "Enter") {
          open(); e.preventDefault();
        } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          open(); search.value = e.key; filter(); e.preventDefault();
        } else if (e.key === "Backspace" || e.key === "Delete") {
          open(); search.value = ""; filter(); e.preventDefault();
        }
      }
    };
    input.addEventListener("keydown", inputKeydownHandler);
    cleanupFunctions.push(() => input.removeEventListener("keydown", inputKeydownHandler));

    const searchInputHandler = () => {
      clearTimeout(filterTimeout);
      filterTimeout = setTimeout(() => filter(), FILTER_DEBOUNCE_DELAY);
    };
    search.addEventListener("input", searchInputHandler);
    cleanupFunctions.push(() => {
      search.removeEventListener("input", searchInputHandler);
      clearTimeout(filterTimeout);
    });

    const searchKeydownHandler = e => {
      const visible = getVisibleOptions();

      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocus(focusedIndex < 0 ? 0 : Math.min(focusedIndex + 1, visible.length - 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocus(Math.max(focusedIndex - 1, 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        toggleFocused();
      } else if (e.key === " ") {
        // Only intercept Space when a row is focused; otherwise let user type freely
        if (focusedIndex >= 0) {
          e.preventDefault();
          toggleFocused();
        }
      } else if (e.key === "Escape") {
        close(); input.focus();
      }
    };
    search.addEventListener("keydown", searchKeydownHandler);
    cleanupFunctions.push(() => search.removeEventListener("keydown", searchKeydownHandler));

    const clearBtnHandler = () => clearSelections();
    clearBtn.addEventListener("click", clearBtnHandler);
    cleanupFunctions.push(() => clearBtn.removeEventListener("click", clearBtnHandler));

    const closeBtnHandler = () => { close(); input.focus(); };
    closeBtn.addEventListener("click", closeBtnHandler);
    cleanupFunctions.push(() => closeBtn.removeEventListener("click", closeBtnHandler));

    const jumpBtnHandler = () => {
      const selectedRows = optionElements.filter(row => {
        const cb = row.querySelector("input[type='checkbox']");
        return cb && cb.checked;
      });

      if (!selectedRows.length) return;
      if (selectedCycleIndex >= selectedRows.length) selectedCycleIndex = 0;

      const targetRow = selectedRows[selectedCycleIndex];
      removeFocus();
      targetRow.classList.add("focused");

      const visible = getVisibleOptions();
      focusedIndex = visible.indexOf(targetRow);
      targetRow.scrollIntoView({ block: "nearest", behavior: "auto" });
      selectedCycleIndex++;
    };
    jumpBtn.addEventListener("click", jumpBtnHandler);
    cleanupFunctions.push(() => jumpBtn.removeEventListener("click", jumpBtnHandler));

    const documentClickHandler = e => {
      if (!wrapper.classList.contains("open")) return;
      if (window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches) return;
      if (!wrapper.contains(e.target)) close();
    };
    document.addEventListener("click", documentClickHandler);
    cleanupFunctions.push(() => document.removeEventListener("click", documentClickHandler));

    const wrapperMouseDownHandler = () => { isClickingInside = true; };
    const documentMouseUpHandler = () => { isClickingInside = false; };
    wrapper.addEventListener("mousedown", wrapperMouseDownHandler);
    document.addEventListener("mouseup", documentMouseUpHandler);
    cleanupFunctions.push(() => wrapper.removeEventListener("mousedown", wrapperMouseDownHandler));
    cleanupFunctions.push(() => document.removeEventListener("mouseup", documentMouseUpHandler));

    const inputClickHandler = () => {
      wrapper.classList.contains("open") ? close() : open();
    };
    input.addEventListener("click", inputClickHandler);
    cleanupFunctions.push(() => input.removeEventListener("click", inputClickHandler));

    const wrapperFocusoutHandler = () => {
      if (window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`).matches) return;
      if (isClickingInside) return;
      requestAnimationFrame(() => {
        if (!wrapper.contains(document.activeElement)) close();
      });
    };
    wrapper.addEventListener("focusout", wrapperFocusoutHandler);
    cleanupFunctions.push(() => wrapper.removeEventListener("focusout", wrapperFocusoutHandler));


    // ==================== FORM INTEGRATION ====================

    const form = input.closest("form");
    if (form) {
      const formResetHandler = () => {
        setTimeout(() => resetInstance(), 0);
      };
      form.addEventListener("reset", formResetHandler);
      cleanupFunctions.push(() => form.removeEventListener("reset", formResetHandler));
    }


    // ==================== INSTANCE API FUNCTIONS ====================

    function setValueOnInstance(inputValue) {
      const previousValue = input.value;

      selected.clear();
      optionsBox.querySelectorAll("input[type='checkbox']").forEach(cb => {
        if (!cb.disabled) {
          cb.checked = false;
          cb.closest(".mom-ms-option")?.setAttribute("aria-selected", "false");
        }
      });

      const values = typeof inputValue === "string"
        ? inputValue.split(",").map(v => v.trim()).filter(Boolean)
        : Array.isArray(inputValue) ? inputValue : [];

      optionsBox.querySelectorAll("input[type='checkbox']").forEach(cb => {
        if (!cb.disabled && values.includes(cb.value)) {
          cb.checked = true;
          selected.add(cb);
          cb.closest(".mom-ms-option")?.setAttribute("aria-selected", "true");
        }
      });

      sync();

      if (input.value !== previousValue) {
        triggerEvent("onChange", { action: "set", values });
      }
    }

    function updateOptionsOnInstance(newOptions) {
      if (!Array.isArray(newOptions)) {
        console.error("[MoMSelect] updateOptions: newOptions must be an array");
        return;
      }

      const currentValues = getValueFromInstance();
      processedOptions = processOptions(newOptions);
      renderOptions(processedOptions);

      if (currentValues.length > 0) setValueOnInstance(currentValues);
    }

    function resetInstance() {
      if (initialValue) {
        setValueOnInstance(initialValue);
      } else {
        clearSelections();
      }
    }

    function disableInstance() {
      input.disabled = true;
      wrapper.classList.add("disabled");
      close();
    }

    function enableInstance() {
      input.disabled = false;
      wrapper.classList.remove("disabled");
    }

    function destroyInstance() {
      document.body.style.overflow = "";
      dropdown.style.top = "";
      dropdown.style.bottom = "";
      clearTimeout(filterTimeout);
      clearTimeout(limitTimeout);

      cleanupFunctions.forEach(fn => fn());

      if (wrapper.parentNode) wrapper.parentNode.insertBefore(input, wrapper);
      wrapper.remove();

      instances.delete(input);
      selected.clear();

      input.removeAttribute("role");
      input.removeAttribute("aria-expanded");
      input.removeAttribute("aria-haspopup");
      input.removeAttribute("aria-controls");
      input.removeAttribute("autocomplete");
    }


    // ==================== BUILD API OBJECT ====================

    const api = {
      get isInitializing() { return isInitializing; },

      config: Object.freeze({
        max, placeholder, clearText, noResultsText,
        labelCol, valueCol, groupCol, disabledCol,
        sortBy, sortType,
      }),

      getValue:          getValueFromInstance,
      setValue:          setValueOnInstance,
      clear:             clearSelections,
      reset:             resetInstance,
      disable:           disableInstance,
      enable:            enableInstance,
      updateOptions:     updateOptionsOnInstance,
      getProcessedOptions: () => processedOptions,
      destroy:           destroyInstance,
    };

    instances.set(input, api);

    // ==================== PRE-FILL ON INIT ====================

    if (input.value.trim()) {
      setValueOnInstance(
        input.value.split(",").map(v => v.trim()).filter(Boolean)
      );
    }

    isInitializing = false;

    return api;
  }


  // ==================== PUBLIC STATIC API ====================

  function destroy(input) {
    if (typeof input === "string") input = document.querySelector(input);
    if (!input) return;
    const inst = instances.get(input);
    if (inst?.destroy) inst.destroy();
  }

  function getValue(input)           { return validateInstance(input).getValue(); }
  function setValue(input, value)    { validateInstance(input).setValue(value); }
  function clear(input)              { validateInstance(input).clear(); }
  function reset(input)              { validateInstance(input).reset(); }
  function disable(input)            { validateInstance(input).disable(); }
  function enable(input)             { validateInstance(input).enable(); }
  function updateOptions(input, opts){ validateInstance(input).updateOptions(opts); }
  function getProcessedOptions(input){ return validateInstance(input).getProcessedOptions(); }
  function getConfig(input)          { return validateInstance(input).config; }
  function get(input)                { return getInstance(input); }
  function isInitialized(input)      { return getInstance(input) !== null; }


  // ==================== RETURN PUBLIC API ====================

  return {
    init,
    destroy,
    get,
    getValue,
    setValue,
    clear,
    reset,
    disable,
    enable,
    updateOptions,
    getProcessedOptions,
    getConfig,
    isInitialized,
  };

}));
