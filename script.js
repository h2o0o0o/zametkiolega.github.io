document.addEventListener("DOMContentLoaded", () => {
  // --- DOM Elements ---
  const boardViewport = document.getElementById("boardViewport");
  const boardWorld = document.getElementById("boardWorld");
  const gridBackground = document.getElementById("gridBackground");
  const drawingCanvas = document.getElementById("drawingCanvas");
  const ctx = drawingCanvas.getContext("2d");
  const contextMenuEl = document.getElementById("contextMenu");
  const toolbar = document.querySelector(".toolbar");
  const sidebar = document.getElementById("sidebar");
  const sidebarToggle = document.getElementById("sidebar-toggle");
  const minimapContainer = document.querySelector(".minimap-container");
  const minimapEl = document.querySelector(".minimap");
  const minimapViewportEl = document.querySelector(".minimap-viewport");
  const zoomLevelEl = document.querySelector(".zoom-level");
  const settingsModal = document.getElementById("settingsModal");
  const shareModal = document.getElementById("shareModal");
  const settingsBtn = document.getElementById("settings-btn");
  const shareBtn = document.getElementById("share-btn");
  const modalCloseBtns = document.querySelectorAll(".modal-close");
  const imgUploadInput = document.getElementById("img-upload");

  // --- State Variables ---
  let worldOffsetX = 0, worldOffsetY = 0, worldScale = 1;
  const MIN_SCALE = 0.1, MAX_SCALE = 4.0;
  let GRID_SIZE = 40;
  let isPanning = false, panStartX, panStartY, initialOffsetX, initialOffsetY;
  let activeTool = "select"; // "select", "hand", "draw", "erase", "text", "shape", "connect"
  let isCurrentlyDrawing = false;
  let drawingPaths = [], currentDrawingPath = {};
  let drawingColor = "#5e6cff";
  let drawingLineWidth = 2;
  let contextMenuVisible = false;
  let contextMenuX = 0, contextMenuY = 0;
  let cardIdCounter = 0;
  let isResizingCard = false;
  let isDraggingCard = false;
  let isDraggingMinimap = false;
  let selectedElements = new Set(); // For multi-select
  let history = []; // For undo/redo
  let historyIndex = -1;
  const MAX_HISTORY = 50;
  let draggedCard = null;
  let resizeCardEl = null;
  let dragOffsetX, dragOffsetY, initialCardX, initialCardY;
  let resizeStartX, resizeStartY, initialCardWidth, initialCardHeight;

  // --- Initialization ---
  function init() {
    setupDrawingCanvas();
    applyWorldTransform();
    activateTool("select");
    updateToolbarState();
    addEventListeners();
    loadBoardFromStorage(); // Attempt to load saved state
    updateMinimap();
  }


  
  // --- Event Listeners ---
  function addEventListeners() {
    // Board Interaction
    boardViewport.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    boardViewport.addEventListener("wheel", handleWheel, { passive: false });
    boardViewport.addEventListener("contextmenu", handleContextMenu);
    document.addEventListener("click", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleResize);

// ─── Сетка ────────────────────────────────
    const showGridCheckbox = document.getElementById('show-grid');
    showGridCheckbox.addEventListener('change', () => {
        gridBackground.style.display = showGridCheckbox.checked ? 'block' : 'none';
    });

    const gridSizeInput = document.getElementById('grid-size');
    const gridSizeValue = document.getElementById('grid-size-value');

    function setGridSize(size) {
        GRID_SIZE = size;
        gridSizeValue.textContent = `${size}px`;
        updateGridBackground();
    }

    gridSizeInput.addEventListener('input', e => setGridSize(+e.target.value));
    setGridSize(+gridSizeInput.value);


    // Toolbar
    toolbar.addEventListener("click", handleToolbarClick);
    document.getElementById("custom-color-input").addEventListener("input", (e) => {
      updateBrushColor(e.target.value);
      // Make the custom color button active visually
      document.querySelectorAll(".color-btn").forEach(btn => btn.classList.remove("active"));
      e.target.closest(".custom-color").classList.add("active");
    });
    imgUploadInput.addEventListener("change", (e) => addImageCardWrapper(e.target.files));

    // Sidebar
    sidebarToggle.addEventListener("click", toggleSidebar);

    // Minimap
    minimapViewportEl.addEventListener("mousedown", handleMinimapMouseDown);

    // Modals
    settingsBtn.addEventListener("click", () => openModal(settingsModal));
    shareBtn.addEventListener("click", () => openModal(shareModal));
    modalCloseBtns.forEach(btn => {
      btn.addEventListener("click", () => closeModal(btn.closest(".modal")));
    });
    document.addEventListener("click", (e) => {
      if (e.target.classList.contains("modal")) {
        closeModal(e.target);
      }
    });

    // Context Menu Actions
    contextMenuEl.addEventListener("click", handleContextMenuAction);
  }

  // --- Core Logic: Panning & Zooming ---
  function applyWorldTransform() {
    // Use requestAnimationFrame for smoother rendering
    requestAnimationFrame(() => {
        boardWorld.style.transform = `translate(${worldOffsetX}px, ${worldOffsetY}px) scale(${worldScale})`;
        updateGridBackground();
        redrawDrawingCanvas();
        updateMinimap();
        updateZoomLevel();
    });
  }

  function updateGridBackground() {
    const bgSize = GRID_SIZE * worldScale;
    const bgPosX = worldOffsetX % bgSize;
    const bgPosY = worldOffsetY % bgSize;
    gridBackground.style.backgroundSize = `${bgSize}px ${bgSize}px`;
    gridBackground.style.backgroundPosition = `${bgPosX}px ${bgPosY}px`;
    const fineGridOpacity = Math.min(1, Math.max(0, (worldScale - 0.2) * 2));
    gridBackground.style.opacity = fineGridOpacity * 0.3;
  }

  function handleMouseDown(e) {
    const target = e.target;
    const isCardTarget = target.closest(".card");
    const isResizer = target.classList.contains("card-resizer");
    const isToolbarTarget = target.closest(".toolbar");
    const isSidebarTarget = target.closest(".sidebar");
    const isContextMenuTarget = target.closest(".context-menu");
    const isMinimapTarget = target.closest(".minimap-container");
    const isEditable = target.isContentEditable || target.tagName === "TEXTAREA" || target.tagName === "INPUT";

    if (isToolbarTarget || isSidebarTarget || isContextMenuTarget || isMinimapTarget || isResizer || isEditable) return;
    if (e.button === 2) return; // Right-click handled by contextmenu

    hideContextMenu();

    if (activeTool === "draw" || activeTool === "erase") {
      if (!isCardTarget && e.button === 0) {
        startDrawing(e);
        e.preventDefault();
      }
    } else if (activeTool === "select") {
      if (isCardTarget && !isResizer && e.button === 0) {
        startDraggingCard(e, isCardTarget);
        e.preventDefault();
      } else if (!isCardTarget && e.button === 0) {
        startPanning(e);
        e.preventDefault();
      }
    } else if (activeTool === "hand") {
        startPanning(e);
        e.preventDefault();
    } else if (activeTool === "text" && !isCardTarget && e.button === 0) {
        const worldPos = viewportToWorld(e.clientX, e.clientY);
        const newCard = addCard("", worldPos.x, worldPos.y);
        // Find the textarea within the new card and focus it
        const textarea = newCard.querySelector("textarea");
        if (textarea) {
            setTimeout(() => { // Timeout needed to ensure element is fully in DOM and focusable
                textarea.style.display = "block";
                newCard.querySelector(".markdown-preview").style.display = "none";
                textarea.focus();
                textarea.style.height = "auto";
                textarea.style.height = textarea.scrollHeight + "px";
            }, 0);
        }
        activateTool("select"); // Switch back to select after adding text
    }
    // Add handlers for shape, connect tools later

    // Middle mouse button always pans
    if (e.button === 1) {
        startPanning(e);
        e.preventDefault();
    }
  }

  function handleMouseMove(e) {
    // Use requestAnimationFrame to throttle expensive updates
    requestAnimationFrame(() => {
        if (isPanning) {
          worldOffsetX = initialOffsetX + (e.clientX - panStartX);
          worldOffsetY = initialOffsetY + (e.clientY - panStartY);
          applyWorldTransform();
        } else if (isCurrentlyDrawing && (activeTool === "draw" || activeTool === "erase")) {
          continueDrawing(e);
        } else if (isDraggingCard) {
          dragCard(e);
        } else if (isResizingCard) {
          resizeCard(e);
        } else if (isDraggingMinimap) {
          dragMinimap(e);
        }
    });
  }

  function handleMouseUp(e) {
    if (e.button === 2) return;

    if (isPanning) {
      stopPanning();
    }
    if (isCurrentlyDrawing) {
      stopDrawing();
    }
    if (isDraggingCard) {
      stopDraggingCard();
    }
    if (isResizingCard) {
      stopResizingCard();
    }
    if (isDraggingMinimap) {
      stopDraggingMinimap();
    }
  }

  function handleWheel(e) {
    const cardContent = e.target.closest(".card .markdown-preview, .card textarea");
    if (cardContent && cardContent.scrollHeight > cardContent.clientHeight) {
      return;
    }

    e.preventDefault();
    hideContextMenu();

    const rect = boardViewport.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const worldMouseX_before = (mouseX - worldOffsetX) / worldScale;
    const worldMouseY_before = (mouseY - worldOffsetY) / worldScale;

    const scaleAmount = 1 - e.deltaY * 0.001;
    let newScale = worldScale * scaleAmount;
    newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));

    worldOffsetX = mouseX - (worldMouseX_before * newScale);
    worldOffsetY = mouseY - (worldMouseY_before * newScale);
    worldScale = newScale;

    applyWorldTransform();
  }

  function startPanning(e) {
    isPanning = true;
    panStartX = e.clientX;
    panStartY = e.clientY;
    initialOffsetX = worldOffsetX;
    initialOffsetY = worldOffsetY;
    boardViewport.style.cursor = "grabbing";
  }

  function stopPanning() {
    isPanning = false;
    updateCursor();
  }

  function updateZoomLevel() {
    zoomLevelEl.textContent = `${Math.round(worldScale * 100)}%`;
  }

  function zoom(factor) {
    const rect = boardViewport.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const worldCenter = viewportToWorld(centerX, centerY);

    let newScale = worldScale * factor;
    newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, newScale));

    worldOffsetX = centerX - (worldCenter.x * newScale);
    worldOffsetY = centerY - (worldCenter.y * newScale);
    worldScale = newScale;
    applyWorldTransform();
  }

  function fitToScreen() {
    if (boardWorld.children.length === 0) {
        worldScale = 1;
        worldOffsetX = 50;
        worldOffsetY = 50;
        applyWorldTransform();
        return;
    }

    const bounds = getBoardWorldBounds(0); // Get bounds without padding
    const viewportRect = boardViewport.getBoundingClientRect();
    const padding = 50; // Viewport padding

    const scaleX = (viewportRect.width - 2 * padding) / bounds.width;
    const scaleY = (viewportRect.height - 2 * padding) / bounds.height;
    worldScale = Math.min(scaleX, scaleY, MAX_SCALE); // Limit max zoom
    worldScale = Math.max(worldScale, MIN_SCALE); // Limit min zoom

    // Center the content
    const scaledBoundsWidth = bounds.width * worldScale;
    const scaledBoundsHeight = bounds.height * worldScale;

    worldOffsetX = (viewportRect.width - scaledBoundsWidth) / 2 - bounds.minX * worldScale;
    worldOffsetY = (viewportRect.height - scaledBoundsHeight) / 2 - bounds.minY * worldScale;

    applyWorldTransform();
  }

  // --- Tool Management ---
  function activateTool(toolName) {
    activeTool = toolName;
    updateToolbarState();
    updateCursor();
    drawingCanvas.style.pointerEvents = (toolName === "draw" || toolName === "erase") ? "auto" : "none";
    if (isCurrentlyDrawing) {
      stopDrawing(true);
    }
    hideContextMenu();
  }

function updateToolbarState() {
  document.querySelectorAll(".toolbar .tool-btn[id$=\"-tool-btn\"]").forEach(btn => {
    btn.classList.toggle("active", btn.id === `${activeTool}-tool-btn`);
  });
  document.querySelectorAll(".color-btn").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.color === drawingColor && !btn.classList.contains("custom-color"));
  });
  // Ensure custom-color-input exists before trying to access its properties or closest
  const customColorInput = document.getElementById("custom-color-input");
  if (customColorInput && customColorInput.closest(".custom-color")) {
    customColorInput.closest(".custom-color").classList.toggle("active", customColorInput.value === drawingColor);
  }


   document.querySelectorAll(".stroke-btn").forEach(btn => {
      btn.classList.toggle("active", parseInt(btn.dataset.width) === drawingLineWidth);
  });

  // --- CORRECTED SECTION ---
  const colorPickerGroup = toolbar.querySelector(".toolbar-group.color-picker");
  const strokePickerGroup = toolbar.querySelector(".toolbar-group.stroke-picker"); // Ensure your HTML has this class on the stroke picker's group
  
  const showDrawSpecificOptions = (activeTool === "draw" || activeTool === "erase" || activeTool === "shape" || activeTool === "connect");

  if (colorPickerGroup) {
      colorPickerGroup.style.display = showDrawSpecificOptions ? "flex" : "none";
  }
  if (strokePickerGroup) {
      strokePickerGroup.style.display = showDrawSpecificOptions ? "flex" : "none";
  }
  // --- END OF CORRECTED SECTION ---
}

  function updateCursor() {
    switch (activeTool) {
      case "select": boardViewport.style.cursor = "default"; break; // Default arrow for select
      case "hand": boardViewport.style.cursor = "grab"; break;
      case "draw": boardViewport.style.cursor = "crosshair"; break;
      case "erase": boardViewport.style.cursor = `url("data:image/svg+xml;utf8,<svg xmlns=\'http://www.w3.org/2000/svg\' width=\'24\' height=\'24\' viewBox=\'0 0 24 24\'><path fill=\'white\' stroke=\'black\' stroke-width=\'1\' d=\'M6 21.917q-.833 0-1.417-.584Q4 20.75 4 19.917V6.083q0-.833.583-1.416Q5.167 4.084 6 4.084h12q.833 0 1.417.583.583.584.583 1.417v13.834q0 .833-.583 1.416-.584.584-1.417.584Zm0-1.5h12V6.083H6Zm6-3.5 4.25-4.25-1.063-1.062L12 15.292l-4.25-4.25-1.062 1.063Z\'/></svg>") 12 12, auto`; break;
      case "text": boardViewport.style.cursor = "text"; break;
      case "shape": boardViewport.style.cursor = "crosshair"; break;
      case "connect": boardViewport.style.cursor = "crosshair"; break;
      default: boardViewport.style.cursor = "default";
    }
  }

  function handleToolbarClick(e) {
    const button = e.target.closest(".tool-btn");
    const colorBtn = e.target.closest(".color-btn:not(.custom-color)");
    const strokeBtn = e.target.closest(".stroke-btn");
    const dropdownItem = e.target.closest(".dropdown-item");

    if (button) {
      const toolId = button.id;
      if (toolId.endsWith("-tool-btn")) {
        const toolName = toolId.replace("-tool-btn", "");
        if (["select", "hand", "draw", "erase", "text", "shape", "connect"].includes(toolName)) {
          activateTool(toolName);
        }
      } else if (toolId === "add-card-btn") {
        const center = getViewportCenterWorld();
        addCard("Новая карточка...", center.x - 125, center.y - 75);
      } else if (toolId === "add-image-btn") {
        imgUploadInput.click();
      } else if (toolId === "undo-btn") {
        undo();
      } else if (toolId === "redo-btn") {
        redo();
      } else if (toolId === "zoom-out-btn") {
        zoom(1 / 1.2);
      } else if (toolId === "zoom-in-btn") {
        zoom(1.2);
      } else if (toolId === "fit-screen-btn") {
        fitToScreen();
      }
    }

    if (colorBtn) {
        updateBrushColor(colorBtn.dataset.color);
    }

    if (strokeBtn) {
        updateBrushSize(parseInt(strokeBtn.dataset.width));
    }

    if (dropdownItem) {
        // Handle dropdown actions (add table, diagram, etc.)
        console.log("Dropdown item clicked:", dropdownItem.textContent.trim());
        // Close dropdown (optional)
        const dropdown = dropdownItem.closest(".dropdown");
        if (dropdown) dropdown.querySelector(".dropdown-menu").style.display = "none";
        setTimeout(() => { if(dropdown) dropdown.querySelector(".dropdown-menu").style.display = ""; }, 100); // Allow hover state to reset
    }
  }

  // --- Drawing Logic ---
  function setupDrawingCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const rect = boardViewport.getBoundingClientRect();
    drawingCanvas.width = rect.width * dpr;
    drawingCanvas.height = rect.height * dpr;
    drawingCanvas.style.width = `${rect.width}px`;
    drawingCanvas.style.height = `${rect.height}px`;
    ctx.setTransform(1, 0, 0, 1, 0, 0); // Reset transform before scaling
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
  }

  function redrawDrawingCanvas() {
    const viewportWidth = drawingCanvas.width / (window.devicePixelRatio || 1);
    const viewportHeight = drawingCanvas.height / (window.devicePixelRatio || 1);
    ctx.clearRect(0, 0, viewportWidth, viewportHeight);

    ctx.save();
    ctx.translate(worldOffsetX, worldOffsetY);
    ctx.scale(worldScale, worldScale);

    drawingPaths.forEach(path => drawPathObject(path));

    if (isCurrentlyDrawing && currentDrawingPath.points && currentDrawingPath.points.length > 0) {
      drawPathObject(currentDrawingPath);
    }

    ctx.restore();
  }

  function drawPathObject(pathObj) {
    if (!pathObj.points || pathObj.points.length < 1) return;
    ctx.beginPath();
    ctx.strokeStyle = pathObj.color;
    ctx.lineWidth = Math.max(0.5, pathObj.lineWidth) / worldScale; // Ensure minimum visible width
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.moveTo(pathObj.points[0].x, pathObj.points[0].y);
    for (let i = 1; i < pathObj.points.length; i++) {
      ctx.lineTo(pathObj.points[i].x, pathObj.points[i].y);
    }
    ctx.stroke();
  }

  function startDrawing(e) {
    isCurrentlyDrawing = true;
    const worldPos = viewportToWorld(e.clientX, e.clientY);

    if (activeTool === "draw") {
      currentDrawingPath = {
        id: `draw-${Date.now()}`,
        color: drawingColor,
        lineWidth: drawingLineWidth,
        points: [{ x: worldPos.x, y: worldPos.y }]
      };
    } else if (activeTool === "erase") {
      currentDrawingPath = { // Temporary path for eraser visualization
        id: `erase-${Date.now()}`,
        color: "rgba(255, 255, 255, 0.5)", // Visual feedback for eraser
        lineWidth: drawingLineWidth * 1.5, // Make eraser visually larger
        points: [{ x: worldPos.x, y: worldPos.y }]
      };
      performErasure(worldPos.x, worldPos.y, drawingLineWidth / worldScale);
    }
  }

  function continueDrawing(e) {
    if (!isCurrentlyDrawing) return;
    const worldPos = viewportToWorld(e.clientX, e.clientY);
    currentDrawingPath.points.push({ x: worldPos.x, y: worldPos.y });

    if (activeTool === "erase") {
      performErasure(worldPos.x, worldPos.y, drawingLineWidth / worldScale);
    }

    redrawDrawingCanvas();
  }

  function stopDrawing(discard = false) {
    if (!isCurrentlyDrawing) return;
    isCurrentlyDrawing = false;

    if (!discard && activeTool === "draw" && currentDrawingPath.points && currentDrawingPath.points.length > 1) {
      // Simplify path slightly? (Optional performance improvement)
      drawingPaths.push(currentDrawingPath);
      recordHistory({ type: "add-path", path: { ...currentDrawingPath } }); // Store copy
    }

    currentDrawingPath = {};
    redrawDrawingCanvas();
  }

  function updateBrushColor(value) {
    drawingColor = value;
    updateToolbarState();
  }

  function updateBrushSize(value) {
    drawingLineWidth = parseInt(value);
    updateToolbarState();
  }

  function performErasure(worldX, worldY, eraseRadiusWorld) {
    let changed = false;
    const removedPaths = [];
    const eraseRadiusSq = eraseRadiusWorld * eraseRadiusWorld;

    for (let i = drawingPaths.length - 1; i >= 0; i--) {
      const path = drawingPaths[i];
      let pathHit = false;
      // Simple point-based check for now
      for (let j = 0; j < path.points.length; j++) {
          const pt = path.points[j];
          const dx = pt.x - worldX;
          const dy = pt.y - worldY;
          if ((dx * dx + dy * dy) < eraseRadiusSq * 4) { // Increase hit radius slightly
              pathHit = true;
              break;
          }
      }

      if (pathHit) {
        removedPaths.push({ path: { ...drawingPaths[i] }, index: i }); // Store copy
        drawingPaths.splice(i, 1);
        changed = true;
      }
    }
    if (changed) {
      recordHistory({ type: "remove-paths", paths: removedPaths.reverse() }); // Store removed paths for undo
      redrawDrawingCanvas();
    }
  }

  // --- Card Management ---
  function createCardElement(id, x, y, width = 250, height) {
    const card = document.createElement("div");
    card.className = "card";
    card.dataset.id = id;
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
    card.style.width = `${width}px`;
    if (height) card.style.height = `${height}px`;
    card.style.zIndex = 10; // Default z-index

    const cardHeader = document.createElement("div");
    cardHeader.className = "card-header";
    const cardColorTag = document.createElement("div");
    cardColorTag.className = "card-color";
    const cardActions = document.createElement("div");
    cardActions.className = "card-actions";
    const closeBtn = document.createElement("button");
    closeBtn.className = "card-btn close-btn";
    closeBtn.title = "Удалить";
    closeBtn.innerHTML = 	'<i class="ri-close-line"></i>';
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      const cardData = getCardData(card);
      boardWorld.removeChild(card);
      recordHistory({ type: "remove-card", cardData: cardData });
      updateMinimap();
    };
    cardActions.appendChild(closeBtn);
    cardHeader.appendChild(cardColorTag);
    cardHeader.appendChild(cardActions);
    card.appendChild(cardHeader);

    const cardContent = document.createElement("div");
    cardContent.className = "card-content";
    card.appendChild(cardContent);

    const resizer = document.createElement("div");
    resizer.className = "card-resizer";
    card.appendChild(resizer);
    resizer.addEventListener("mousedown", (e) => {
        e.stopPropagation();
        startResizingCard(e, card);
    });

    card.addEventListener("mousedown", (e) => {
        if (activeTool === "select" && e.button === 0 && !e.target.closest(".card-resizer, .card-actions, textarea, .markdown-preview, input, button, select")) {
            bringToFront(card);
        }
    });

    return card;
  }

  function addCard(content = "", x = 100, y = 100, id = `card-${cardIdCounter++}`, width, height, type = "text", zIndex = 10) {
    const card = createCardElement(id, x, y, width, height);
    const cardContentEl = card.querySelector(".card-content");
    card.style.zIndex = zIndex;

    if (type === "text") {
      const textarea = document.createElement("textarea");
      const previewDiv = document.createElement("div");
      previewDiv.className = "markdown-preview";
      textarea.placeholder = "Введите текст...";
      textarea.value = content;
      card.dataset.markdownContent = content;

      function renderMarkdown() {
          try {
              previewDiv.innerHTML = marked.parse(card.dataset.markdownContent || "*Пусто*");
          } catch (err) {
              previewDiv.innerHTML = "Ошибка рендеринга Markdown";
              console.error("Markdown parsing error:", err);
          }
      }

      function switchToPreview() {
        card.dataset.markdownContent = textarea.value;
        renderMarkdown();
        previewDiv.style.display = "block";
        textarea.style.display = "none";
      }

      function switchToEdit() {
        previewDiv.style.display = "none";
        textarea.style.display = "block";
        textarea.value = card.dataset.markdownContent || "";
        textarea.focus();
        textarea.style.height = "auto";
        textarea.style.height = textarea.scrollHeight + "px";
      }

      textarea.addEventListener("input", () => {
          textarea.style.height = "auto";
          textarea.style.height = textarea.scrollHeight + "px";
          card.dataset.markdownContent = textarea.value; // Update data on input
      });
      previewDiv.ondblclick = switchToEdit;
      textarea.onblur = switchToPreview;
      textarea.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          textarea.blur();
        }
        // Prevent board keydowns while editing
        e.stopPropagation();
      });

      cardContentEl.appendChild(previewDiv);
      cardContentEl.appendChild(textarea);
      switchToPreview();

    } else if (type === "img") {
      const img = document.createElement("img");
      img.src = content;
      img.style.maxWidth = "100%";
      img.style.display = "block";
      img.style.borderRadius = "var(--border-radius)"; // Add some rounding
      img.onload = () => {
        if (!height) {
          const aspectRatio = img.naturalHeight / img.naturalWidth;
          const currentWidth = card.offsetWidth - 32;
          card.style.height = `${currentWidth * aspectRatio + 60}px`;
        }
        updateMinimap(); // Update minimap after image loads
      };
      img.onerror = () => { img.alt = "Не удалось загрузить изображение"; };
      cardContentEl.appendChild(img);
    }

    boardWorld.appendChild(card);
    bringToFront(card);
    recordHistory({ type: "add-card", cardData: getCardData(card) });
    updateMinimap();
    return card;
  }

  function addImageCardWrapper(files) {
    if (!files || !files[0]) return;
    const file = files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      const center = getViewportCenterWorld();
      // Use stored position from context menu if available
      const posX = imgUploadInput.dataset.posX ? parseFloat(imgUploadInput.dataset.posX) : center.x - 150;
      const posY = imgUploadInput.dataset.posY ? parseFloat(imgUploadInput.dataset.posY) : center.y - 100;
      addCard(e.target.result, posX, posY, undefined, 300, undefined, "img");
      // Clear stored position
      delete imgUploadInput.dataset.posX;
      delete imgUploadInput.dataset.posY;
    };
    reader.readAsDataURL(file);
    imgUploadInput.value = "";
  }

  function startDraggingCard(e, card) {
    isDraggingCard = true;
    draggedCard = card;
    draggedCard.classList.add("dragging");
    bringToFront(draggedCard);
    const cardRect = card.getBoundingClientRect();
    const viewportRect = boardViewport.getBoundingClientRect();
    // Calculate offset relative to viewport, adjusted for scale
    dragOffsetX = (e.clientX - cardRect.left) / worldScale;
    dragOffsetY = (e.clientY - cardRect.top) / worldScale;
    // Store initial world position
    initialCardX = parseFloat(card.style.left);
    initialCardY = parseFloat(card.style.top);
    boardViewport.style.cursor = "grabbing"; // Change cursor while dragging
  }

  function dragCard(e) {
    if (!isDraggingCard || !draggedCard) return;
    // Calculate new world position based on mouse movement and initial offset
    const worldPos = viewportToWorld(e.clientX, e.clientY);
    draggedCard.style.left = `${worldPos.x - dragOffsetX}px`;
    draggedCard.style.top = `${worldPos.y - dragOffsetY}px`;
  }

  function stopDraggingCard() {
    if (!isDraggingCard || !draggedCard) return;
    draggedCard.classList.remove("dragging");
    const finalCardX = parseFloat(draggedCard.style.left);
    const finalCardY = parseFloat(draggedCard.style.top);
    if (finalCardX !== initialCardX || finalCardY !== initialCardY) {
        recordHistory({ type: "move-card", cardId: draggedCard.dataset.id, from: {x: initialCardX, y: initialCardY}, to: {x: finalCardX, y: finalCardY} });
    }
    isDraggingCard = false;
    draggedCard = null;
    updateCursor(); // Reset cursor
    updateMinimap();
  }

  function startResizingCard(e, card) {
    isResizingCard = true;
    resizeCardEl = card;
    resizeCardEl.classList.add("resizing");
    initialCardWidth = card.offsetWidth;
    initialCardHeight = card.offsetHeight;
    initialCardX = parseFloat(card.style.left);
    initialCardY = parseFloat(card.style.top);
    resizeStartX = e.clientX;
    resizeStartY = e.clientY;
    document.addEventListener("mousemove", resizeCard);
    document.addEventListener("mouseup", stopResizingCard);
  }

  function resizeCard(e) {
    if (!isResizingCard || !resizeCardEl) return;
    const dx = (e.clientX - resizeStartX) / worldScale;
    const dy = (e.clientY - resizeStartY) / worldScale;
    const newWidth = Math.max(150, initialCardWidth + dx);
    const newHeight = Math.max(100, initialCardHeight + dy);
    resizeCardEl.style.width = `${newWidth}px`;
    resizeCardEl.style.height = `${newHeight}px`;
    const textarea = resizeCardEl.querySelector("textarea");
    if (textarea && textarea.style.display !== "none") {
        textarea.style.height = "auto";
        textarea.style.height = textarea.scrollHeight + "px";
    }
  }

  function stopResizingCard() {
    if (!isResizingCard || !resizeCardEl) return;
    resizeCardEl.classList.remove("resizing");
    document.removeEventListener("mousemove", resizeCard);
    document.removeEventListener("mouseup", stopResizingCard);
    const finalWidth = resizeCardEl.offsetWidth;
    const finalHeight = resizeCardEl.offsetHeight;
    if (finalWidth !== initialCardWidth || finalHeight !== initialCardHeight) {
        recordHistory({ type: "resize-card", cardId: resizeCardEl.dataset.id, from: {w: initialCardWidth, h: initialCardHeight}, to: {w: finalWidth, h: finalHeight} });
    }
    isResizingCard = false;
    resizeCardEl = null;
    updateMinimap();
  }

  function bringToFront(element) {
    const maxZ = Array.from(boardWorld.children).reduce((max, child) => {
        const z = parseInt(child.style.zIndex) || 0;
        return Math.max(max, z);
    }, 9); // Start z-index from 10
    element.style.zIndex = maxZ + 1;
  }

  // --- Context Menu ---
  function handleContextMenu(e) {
    e.preventDefault();
    const target = e.target;
    const isCardContent = target.closest(".card textarea, .card .markdown-preview");

    if (isCardContent) {
        hideContextMenu();
        return;
    }

    contextMenuX = e.clientX;
    contextMenuY = e.clientY;
    contextMenuEl.style.left = `${contextMenuX}px`;
    contextMenuEl.style.top = `${contextMenuY}px`;
    contextMenuEl.style.display = "block";
    contextMenuVisible = true;
  }

  function hideContextMenu() {
    if (contextMenuVisible) {
      contextMenuEl.style.display = "none";
      contextMenuVisible = false;
    }
  }

  function handleClickOutside(e) {
    if (contextMenuVisible && !contextMenuEl.contains(e.target)) {
      hideContextMenu();
    }
    if (activeTool === "select" && !e.target.closest(".card, .toolbar, .sidebar, .context-menu, .minimap-container")) {
        selectedElements.clear();
        document.querySelectorAll(".card.selected").forEach(c => c.classList.remove("selected"));
    }
  }

  function handleContextMenuAction(e) {
      const item = e.target.closest(".context-menu-item");
      if (!item) return;

      const action = item.dataset.action;
      const worldPos = viewportToWorld(contextMenuX, contextMenuY);

      switch(action) {
          case "add-text":
              addCard("", worldPos.x, worldPos.y);
              break;
          case "add-image":
              imgUploadInput.dataset.posX = worldPos.x;
              imgUploadInput.dataset.posY = worldPos.y;
              imgUploadInput.click();
              break;
          case "paste":
              pasteAtLocation(worldPos.x, worldPos.y);
              break;
          // Add other actions later
          default:
              console.log("Context menu action:", action);
      }

      hideContextMenu();
  }

  async function pasteAtLocation(worldX, worldY) {
      try {
          const clipboardItems = await navigator.clipboard.read();
          for (const item of clipboardItems) {
              if (item.types.includes("text/plain")) {
                  const blob = await item.getType("text/plain");
                  const text = await blob.text();
                  addCard(text, worldX, worldY);
                  break;
              } else if (item.types.find(type => type.startsWith("image/"))) {
                  const imageType = item.types.find(type => type.startsWith("image/"));
                  const blob = await item.getType(imageType);
                  const reader = new FileReader();
                  reader.onload = (e) => {
                      addCard(e.target.result, worldX, worldY, undefined, 300, undefined, "img");
                  };
                  reader.readAsDataURL(blob);
                  break;
              }
          }
      } catch (err) {
          console.error("Failed to read clipboard contents: ", err);
          alert("Не удалось вставить из буфера обмена. Возможно, требуется разрешение.");
      }
  }

  // --- Minimap ---
  function updateMinimap() {
    requestAnimationFrame(() => {
        if (!boardWorld.children.length && drawingPaths.length === 0) {
            minimapContainer.style.display = "none";
            return;
        }
        minimapContainer.style.display = "block";

        const worldBounds = getBoardWorldBounds();
        const viewportRect = boardViewport.getBoundingClientRect();

        if (worldBounds.width <= 0 || worldBounds.height <= 0) return; // Avoid division by zero

        const scaleX = minimapEl.clientWidth / worldBounds.width;
        const scaleY = minimapEl.clientHeight / worldBounds.height;
        const minimapScale = Math.min(scaleX, scaleY) * 0.95; // Use more space

        const minimapViewportWidth = Math.min(minimapEl.clientWidth, viewportRect.width / worldScale * minimapScale);
        const minimapViewportHeight = Math.min(minimapEl.clientHeight, viewportRect.height / worldScale * minimapScale);
        const minimapViewportX = Math.max(0, (-worldOffsetX / worldScale - worldBounds.minX) * minimapScale);
        const minimapViewportY = Math.max(0, (-worldOffsetY / worldScale - worldBounds.minY) * minimapScale);

        minimapViewportEl.style.width = `${minimapViewportWidth}px`;
        minimapViewportEl.style.height = `${minimapViewportHeight}px`;
        minimapViewportEl.style.left = `${minimapViewportX}px`;
        minimapViewportEl.style.top = `${minimapViewportY}px`;

        minimapViewportEl.dataset.minimapScale = minimapScale;
        minimapViewportEl.dataset.worldMinX = worldBounds.minX;
        minimapViewportEl.dataset.worldMinY = worldBounds.minY;
    });
  }

  function getBoardWorldBounds(padding = 200) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let hasContent = false;

    Array.from(boardWorld.children).forEach(el => {
      if (el.classList.contains("card")) {
          const x = parseFloat(el.style.left);
          const y = parseFloat(el.style.top);
          const w = el.offsetWidth;
          const h = el.offsetHeight;
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x + w);
          maxY = Math.max(maxY, y + h);
          hasContent = true;
      }
    });

    drawingPaths.forEach(path => {
        path.points.forEach(pt => {
            minX = Math.min(minX, pt.x);
            minY = Math.min(minY, pt.y);
            maxX = Math.max(maxX, pt.x);
            maxY = Math.max(maxY, pt.y);
            hasContent = true;
        });
    });

    if (!hasContent) {
        const center = getViewportCenterWorld();
        return { minX: center.x - 500, minY: center.y - 500, maxX: center.x + 500, maxY: center.y + 500, width: 1000, height: 1000 };
    }

    minX -= padding; minY -= padding; maxX += padding; maxY += padding;

    return { minX, minY, maxX, maxY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) }; // Ensure width/height > 0
  }

  let minimapDragStartX, minimapDragStartY;
  function handleMinimapMouseDown(e) {
      if (e.button !== 0) return;
      isDraggingMinimap = true;
      minimapDragStartX = e.clientX;
      minimapDragStartY = e.clientY;
      document.addEventListener("mousemove", dragMinimap);
      document.addEventListener("mouseup", stopDraggingMinimap);
      e.stopPropagation();
  }

  function dragMinimap(e) {
      if (!isDraggingMinimap) return;
      const dx = e.clientX - minimapDragStartX;
      const dy = e.clientY - minimapDragStartY;

      const minimapScale = parseFloat(minimapViewportEl.dataset.minimapScale);
      const worldMinX = parseFloat(minimapViewportEl.dataset.worldMinX);
      const worldMinY = parseFloat(minimapViewportEl.dataset.worldMinY);

      if (!minimapScale) return; // Avoid NaN if scale is 0

      // Calculate how much the world offset should change based on minimap drag
      const worldDx = -dx / minimapScale;
      const worldDy = -dy / minimapScale;

      // Update world offset directly
      worldOffsetX += worldDx * worldScale;
      worldOffsetY += worldDy * worldScale;

      applyWorldTransform();

      minimapDragStartX = e.clientX;
      minimapDragStartY = e.clientY;
  }

  function stopDraggingMinimap() {
      isDraggingMinimap = false;
      document.removeEventListener("mousemove", dragMinimap);
      document.removeEventListener("mouseup", stopDraggingMinimap);
  }

  // --- Sidebar ---
  function toggleSidebar() {
    sidebar.classList.toggle("collapsed");
    const transitionDuration = parseFloat(getComputedStyle(sidebar).transitionDuration) * 1000;
    // Use timeout to ensure transition completes before resizing
    setTimeout(() => {
        handleResize();
    }, transitionDuration);
  }

  // --- Modals ---
  function openModal(modal) {
    modal.classList.add("active");
  }

  function closeModal(modal) {
    modal.classList.remove("active");
  }

  // ─── Theme ────────────────────────────────────────────────────────────
const themeSelect = document.getElementById('theme-select');
const themeBtn    = document.getElementById('theme-btn');

function applyTheme(theme) {
    if (theme === 'dark') {
        document.body.classList.add('dark-theme');
    } else if (theme === 'light') {
        document.body.classList.remove('dark-theme');
    } else {                       // auto
        const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        document.body.classList.toggle('dark-theme', prefersDark);
    }
    localStorage.setItem('mindCanvasTheme', theme);
}

themeSelect.addEventListener('change', e => applyTheme(e.target.value));
themeBtn.addEventListener('click', () => {
    // циклим auto → light → dark
    const order = ['auto','light','dark'];
    const next  = order[(order.indexOf(themeSelect.value)+1)%order.length];
    themeSelect.value = next;
    applyTheme(next);
});

// при старте
applyTheme(localStorage.getItem('mindCanvasTheme') || 'auto');

  // --- Utility Functions ---
  function viewportToWorld(clientX, clientY, ignoreOffset = false) {
    const rect = boardViewport.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (ignoreOffset) {
        return { x: x / worldScale, y: y / worldScale };
    }
    return {
      x: (x - worldOffsetX) / worldScale,
      y: (y - worldOffsetY) / worldScale
    };
  }

  function getViewportCenterWorld() {
    const rect = boardViewport.getBoundingClientRect();
    return viewportToWorld(rect.left + rect.width / 2, rect.top + rect.height / 2);
  }

  function handleKeyDown(e) {
    hideContextMenu();
    if (document.activeElement.tagName === "INPUT" || document.activeElement.tagName === "TEXTAREA" || document.activeElement.isContentEditable) return;

    let handled = true; // Assume handled unless default case
    switch (e.key.toLowerCase()) {
      case "v": activateTool("select"); break;
      case "h": activateTool("hand"); break;
      case "b": activateTool("draw"); break;
      case "e": activateTool("erase"); break;
      case "t": activateTool("text"); break;
      case "s": activateTool("shape"); break;
      case "c": activateTool("connect"); break;
      case "n":
          const center = getViewportCenterWorld();
          addCard("Новая карточка...", center.x - 125, center.y - 75);
          break;
      case "i": imgUploadInput.click(); break;
      case "+":
      case "=": zoom(1.2); break;
      case "-": zoom(1 / 1.2); break;
      case "z":
        if (e.ctrlKey || e.metaKey) {
          undo();
        } else {
            handled = false;
        }
        break;
      case "y":
        if (e.ctrlKey || e.metaKey) {
          redo();
        } else {
            handled = false;
        }
        break;
      case "s":
          if (e.ctrlKey || e.metaKey) {
              saveBoardToStorage();
              // Add visual feedback for save
              const saveBtn = document.querySelector(".header-btn[title=\"Сохранить\"]"); // Assuming a save button exists
              if(saveBtn) {
                  saveBtn.innerHTML = 	'<i class="ri-check-line"></i>';
                  setTimeout(() => { saveBtn.innerHTML = 	'<i class="ri-save-line"></i>'; }, 1500);
              }
          } else {
              handled = false;
          }
          break;
      // case "o": // Load might need confirmation
      //     if (e.ctrlKey || e.metaKey) {
      //         loadBoardFromStorage();
      //     } else {
      //         handled = false;
      //     }
      //     break;
      case "delete":
      case "backspace":
          // Delete selected elements (implement selection first)
          // deleteSelected();
          break;
      default:
          handled = false; // Not one of our shortcuts
    }
    if (handled) {
        e.preventDefault();
    }
  }

  function handleResize() {
    setupDrawingCanvas();
    applyWorldTransform();
  }

  // --- History (Undo/Redo) ---
  function recordHistory(action) {
      // Clear future history if we add a new action
      if (historyIndex < history.length - 1) {
          history = history.slice(0, historyIndex + 1);
      }
      history.push(action);
      // Limit history size
      if (history.length > MAX_HISTORY) {
          history.shift();
      } else {
          historyIndex++;
      }
      updateUndoRedoButtons();
  }

  function undo() {
      if (historyIndex < 0) return; // Nothing to undo

      const action = history[historyIndex];
      historyIndex--;

      switch (action.type) {
          case "add-card":
              const cardToRemove = boardWorld.querySelector(`.card[data-id="${action.cardData.id}"]`);
              if (cardToRemove) boardWorld.removeChild(cardToRemove);
              break;
          case "remove-card":
              addCard(action.cardData.content, action.cardData.x, action.cardData.y, action.cardData.id, action.cardData.width, action.cardData.height, action.cardData.type, action.cardData.zIndex);
              break;
          case "move-card":
              const cardToMove = boardWorld.querySelector(`.card[data-id="${action.cardId}"]`);
              if (cardToMove) {
                  cardToMove.style.left = `${action.from.x}px`;
                  cardToMove.style.top = `${action.from.y}px`;
              }
              break;
          case "resize-card":
              const cardToResize = boardWorld.querySelector(`.card[data-id="${action.cardId}"]`);
              if (cardToResize) {
                  cardToResize.style.width = `${action.from.w}px`;
                  cardToResize.style.height = `${action.from.h}px`;
              }
              break;
          case "add-path":
              drawingPaths = drawingPaths.filter(p => p.id !== action.path.id);
              break;
          case "remove-paths": // Undo removing multiple paths
              action.paths.forEach(removed => {
                  drawingPaths.splice(removed.index, 0, removed.path);
              });
              break;
      }
      applyWorldTransform(); // Redraw everything
      updateUndoRedoButtons();
  }

  function redo() {
      if (historyIndex >= history.length - 1) return; // Nothing to redo

      historyIndex++;
      const action = history[historyIndex];

      switch (action.type) {
          case "add-card":
              addCard(action.cardData.content, action.cardData.x, action.cardData.y, action.cardData.id, action.cardData.width, action.cardData.height, action.cardData.type, action.cardData.zIndex);
              break;
          case "remove-card":
              const cardToRemove = boardWorld.querySelector(`.card[data-id="${action.cardData.id}"]`);
              if (cardToRemove) boardWorld.removeChild(cardToRemove);
              break;
          case "move-card":
              const cardToMove = boardWorld.querySelector(`.card[data-id="${action.cardId}"]`);
              if (cardToMove) {
                  cardToMove.style.left = `${action.to.x}px`;
                  cardToMove.style.top = `${action.to.y}px`;
              }
              break;
          case "resize-card":
              const cardToResize = boardWorld.querySelector(`.card[data-id="${action.cardId}"]`);
              if (cardToResize) {
                  cardToResize.style.width = `${action.to.w}px`;
                  cardToResize.style.height = `${action.to.h}px`;
              }
              break;
          case "add-path":
              drawingPaths.push(action.path);
              break;
          case "remove-paths": // Redo removing multiple paths
              action.paths.forEach(removed => {
                  drawingPaths = drawingPaths.filter(p => p.id !== removed.path.id);
              });
              break;
      }
      applyWorldTransform(); // Redraw everything
      updateUndoRedoButtons();
  }

  function updateUndoRedoButtons() {
      const undoBtn = document.getElementById("undo-btn");
      const redoBtn = document.getElementById("redo-btn");
      if (undoBtn) undoBtn.disabled = historyIndex < 0;
      if (redoBtn) redoBtn.disabled = historyIndex >= history.length - 1;
  }

  // --- Save/Load ---
  function getCardData(cardElement) {
      const isImg = !!cardElement.querySelector("img");
      const type = isImg ? "img" : "text";
      let content = "";
      if (type === "text") {
          content = cardElement.dataset.markdownContent || "";
      } else {
          const img = cardElement.querySelector("img");
          content = img ? img.src : "";
      }

      return {
          id: cardElement.dataset.id,
          type: type,
          x: parseFloat(cardElement.style.left),
          y: parseFloat(cardElement.style.top),
          width: cardElement.offsetWidth,
          height: cardElement.offsetHeight,
          content: content,
          zIndex: parseInt(cardElement.style.zIndex) || 10
      };
  }

  function saveBoardToStorage() {
      try {
          const data = {
              cards: Array.from(boardWorld.querySelectorAll(".card")).map(getCardData),
              drawing: drawingPaths,
              viewport: { offsetX: worldOffsetX, offsetY: worldOffsetY, scale: worldScale },
              cardIdCounter: cardIdCounter,
              history: history, // Save history too?
              historyIndex: historyIndex
          };
          localStorage.setItem("mindCanvasBoard", JSON.stringify(data));
          console.log("Board saved to localStorage");
      } catch (error) {
          console.error("Error saving board:", error);
          alert("Ошибка сохранения доски. Возможно, достигнут лимит хранилища.");
      }
  }

  function loadBoardFromStorage() {
      const savedData = localStorage.getItem("mindCanvasBoard");
      if (!savedData) return;

      try {
          const data = JSON.parse(savedData);

          // Clear existing board
          boardWorld.innerHTML = "";
          drawingPaths = [];
          history = [];
          historyIndex = -1;

          if (data.viewport) {
              worldOffsetX = data.viewport.offsetX || 0;
              worldOffsetY = data.viewport.offsetY || 0;
              worldScale = data.viewport.scale || 1;
          }

          if (data.cards) {
              // Sort cards by zIndex before adding to preserve layering
              data.cards.sort((a, b) => (a.zIndex || 10) - (b.zIndex || 10));
              data.cards.forEach(c => {
                  addCard(c.content, c.x, c.y, c.id, c.width, c.height, c.type, c.zIndex);
              });
          }

          if (data.drawing) {
              drawingPaths = data.drawing;
          }

          cardIdCounter = data.cardIdCounter || 0;
          
          // Restore history (optional)
          // if (data.history && data.historyIndex !== undefined) {
          //     history = data.history;
          //     historyIndex = data.historyIndex;
          // }

          applyWorldTransform();
          updateUndoRedoButtons();
          console.log("Board loaded from localStorage");

      } catch (err) {
          console.error("Error loading board from localStorage:", err);
          localStorage.removeItem("mindCanvasBoard");
          alert("Ошибка загрузки доски. Данные могут быть повреждены.");
      }
  }

  // --- Auto-save ---
  setInterval(saveBoardToStorage, 60000); // Save every 60 seconds

  // --- Start the application ---
  init();
});

