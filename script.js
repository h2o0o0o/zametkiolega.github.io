document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Elements ---
  const boardViewport = document.getElementById('boardViewport');
  const boardWorld = document.getElementById('boardWorld');
  const gridBackground = document.getElementById('gridBackground');
  const drawingCanvas = document.getElementById('drawingCanvas');
  const ctx = drawingCanvas.getContext('2d');
  const contextMenuEl = document.getElementById('contextMenu');
  const toolbar = document.querySelector('.toolbar');
  const sidebar = document.getElementById('sidebar');
  const sidebarToggle = document.getElementById('sidebar-toggle');
  const minimapContainer = document.querySelector('.minimap-container');
  const minimapEl = document.querySelector('.minimap');
  const minimapViewportEl = document.querySelector('.minimap-viewport');
  const zoomLevelEl = document.querySelector('.zoom-level');
  const settingsModal = document.getElementById('settingsModal');
  const shareModal = document.getElementById('shareModal');
  const settingsBtn = document.getElementById('settings-btn');
  const shareBtn = document.getElementById('share-btn');
  const modalCloseBtns = document.querySelectorAll('.modal-close');
  const imgUploadInput = document.getElementById('img-upload');

  // --- State Variables ---
  let worldOffsetX = 0, worldOffsetY = 0, worldScale = 1;
  const MIN_SCALE = 0.1, MAX_SCALE = 4.0;
  let GRID_SIZE = 40;
  let isPanning = false, panStartX, panStartY, initialOffsetX, initialOffsetY;
  let activeTool = 'select'; // 'select', 'hand', 'draw', 'erase', 'text', 'shape', 'connect'
  let isCurrentlyDrawing = false;
  let drawingPaths = [], currentDrawingPath = {};
  let drawingColor = '#5e6cff';
  let drawingLineWidth = 2;
  let contextMenuVisible = false;
  let contextMenuX = 0, contextMenuY = 0;
  let cardIdCounter = 0;
  let isResizingCard = false;
  let isDraggingCard = false;
  let isDraggingMinimap = false;
  let selectedElements = new Set(); // For future multi-select
  let history = []; // For undo/redo
  let historyIndex = -1;

  // --- Initialization ---
  function init() {
    setupDrawingCanvas();
    applyWorldTransform();
    activateTool('select');
    updateToolbarState();
    addEventListeners();
    // Load initial state if available (e.g., from localStorage)
    // loadBoardFromStorage();
    updateMinimap();
  }

  // --- Event Listeners ---
  function addEventListeners() {
    // Board Interaction
    boardViewport.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    boardViewport.addEventListener('wheel', handleWheel, { passive: false });
    boardViewport.addEventListener('contextmenu', handleContextMenu);
    document.addEventListener('click', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('resize', handleResize);

    // Toolbar
    toolbar.addEventListener('click', handleToolbarClick);
    document.getElementById('custom-color-input').addEventListener('change', (e) => {
      updateBrushColor(e.target.value);
      // Make the custom color button active visually
      document.querySelectorAll('.color-btn').forEach(btn => btn.classList.remove('active'));
      e.target.closest('.custom-color').classList.add('active');
    });
    imgUploadInput.addEventListener('change', (e) => addImageCardWrapper(e.target.files));

    // Sidebar
    sidebarToggle.addEventListener('click', toggleSidebar);

    // Minimap
    minimapViewportEl.addEventListener('mousedown', handleMinimapMouseDown);

    // Modals
    settingsBtn.addEventListener('click', () => openModal(settingsModal));
    shareBtn.addEventListener('click', () => openModal(shareModal));
    modalCloseBtns.forEach(btn => {
      btn.addEventListener('click', () => closeModal(btn.closest('.modal')));
    });
    document.addEventListener('click', (e) => {
      if (e.target.classList.contains('modal')) {
        closeModal(e.target);
      }
    });
    
    // Context Menu Actions
    contextMenuEl.addEventListener('click', handleContextMenuAction);
  }

  // --- Core Logic: Panning & Zooming ---
  function applyWorldTransform() {
    boardWorld.style.transform = `translate(${worldOffsetX}px, ${worldOffsetY}px) scale(${worldScale})`;
    updateGridBackground();
    redrawDrawingCanvas();
    updateMinimap();
    updateZoomLevel();
  }

  function updateGridBackground() {
    const bgSize = GRID_SIZE * worldScale;
    const bgPosX = worldOffsetX % bgSize;
    const bgPosY = worldOffsetY % bgSize;
    gridBackground.style.backgroundSize = `${bgSize}px ${bgSize}px`;
    gridBackground.style.backgroundPosition = `${bgPosX}px ${bgPosY}px`;
    // Adjust grid line visibility based on scale (optional)
    const fineGridOpacity = Math.min(1, Math.max(0, (worldScale - 0.2) * 2));
    gridBackground.style.opacity = fineGridOpacity * 0.3; // Base opacity 0.3
  }

  function handleMouseDown(e) {
    const target = e.target;
    const isCardTarget = target.closest('.card');
    const isResizer = target.classList.contains('card-resizer');
    const isToolbarTarget = target.closest('.toolbar');
    const isSidebarTarget = target.closest('.sidebar');
    const isContextMenuTarget = target.closest('.context-menu');
    const isMinimapTarget = target.closest('.minimap-container');

    if (isToolbarTarget || isSidebarTarget || isContextMenuTarget || isMinimapTarget || isResizer) return;
    if (e.button === 2) return; // Right-click handled by contextmenu

    hideContextMenu();

    if (activeTool === 'draw' || activeTool === 'erase') {
      if (!isCardTarget && e.button === 0) {
        startDrawing(e);
        e.preventDefault();
      }
    } else if (activeTool === 'select') {
      if (isCardTarget && !isResizer && e.button === 0) {
        startDraggingCard(e, isCardTarget);
        e.preventDefault();
      } else if (!isCardTarget && e.button === 0) {
        startPanning(e);
        e.preventDefault();
      }
    } else if (activeTool === 'hand') {
        startPanning(e);
        e.preventDefault();
    } else if (activeTool === 'text' && !isCardTarget && e.button === 0) {
        const worldPos = viewportToWorld(e.clientX, e.clientY);
        addCard('Новый текст...', worldPos.x, worldPos.y);
        activateTool('select'); // Switch back to select after adding text
    }
    // Add handlers for shape, connect tools later

    // Middle mouse button always pans
    if (e.button === 1) {
        startPanning(e);
        e.preventDefault();
    }
  }

  function handleMouseMove(e) {
    if (isPanning) {
      worldOffsetX = initialOffsetX + (e.clientX - panStartX);
      worldOffsetY = initialOffsetY + (e.clientY - panStartY);
      applyWorldTransform();
    } else if (isCurrentlyDrawing && (activeTool === 'draw' || activeTool === 'erase')) {
      continueDrawing(e);
    } else if (isDraggingCard) {
      dragCard(e);
    } else if (isResizingCard) {
      resizeCard(e);
    } else if (isDraggingMinimap) {
      dragMinimap(e);
    }
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
    // Prevent zoom while scrolling inside a card's scrollable area
    const cardContent = e.target.closest('.card .markdown-preview, .card textarea');
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

    const scaleAmount = 1 - e.deltaY * 0.0015;
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
    boardViewport.style.cursor = 'grabbing';
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
    // Basic implementation: Reset zoom and center (needs refinement)
    worldScale = 1;
    worldOffsetX = 50;
    worldOffsetY = 50;
    applyWorldTransform();
  }

  // --- Tool Management ---
  function activateTool(toolName) {
    activeTool = toolName;
    updateToolbarState();
    updateCursor();
    drawingCanvas.style.pointerEvents = (toolName === 'draw' || toolName === 'erase') ? 'auto' : 'none';
    if (isCurrentlyDrawing) { // Cancel drawing if tool changes
      stopDrawing(true); // Pass true to discard the path
    }
    hideContextMenu();
  }

  function updateToolbarState() {
    // Update tool buttons
    document.querySelectorAll('.toolbar .tool-btn[id$="-tool-btn"]').forEach(btn => {
      btn.classList.toggle('active', btn.id === `${activeTool}-tool-btn`);
    });
    // Update color/stroke buttons (example)
    document.querySelectorAll('.color-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.color === drawingColor);
    });
     document.querySelectorAll('.stroke-btn').forEach(btn => {
        btn.classList.toggle('active', parseInt(btn.dataset.width) === drawingLineWidth);
    });
    // Show/hide relevant options based on tool (e.g., color/stroke for draw)
    const drawOptions = toolbar.querySelector('.color-picker').parentElement;
    if (drawOptions) {
        drawOptions.style.display = (activeTool === 'draw' || activeTool === 'erase' || activeTool === 'shape' || activeTool === 'connect') ? 'flex' : 'none';
    }
  }

  function updateCursor() {
    switch (activeTool) {
      case 'select': boardViewport.style.cursor = 'grab'; break;
      case 'hand': boardViewport.style.cursor = 'grab'; break;
      case 'draw': boardViewport.style.cursor = 'crosshair'; break;
      case 'erase': boardViewport.style.cursor = `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path fill='white' stroke='black' stroke-width='1' d='M6 21.917q-.833 0-1.417-.584Q4 20.75 4 19.917V6.083q0-.833.583-1.416Q5.167 4.084 6 4.084h12q.833 0 1.417.583.583.584.583 1.417v13.834q0 .833-.583 1.416-.584.584-1.417.584Zm0-1.5h12V6.083H6Zm6-3.5 4.25-4.25-1.063-1.062L12 15.292l-4.25-4.25-1.062 1.063Z'/></svg>") 12 12, auto`; break; // Example eraser cursor
      case 'text': boardViewport.style.cursor = 'text'; break;
      case 'shape': boardViewport.style.cursor = 'crosshair'; break;
      case 'connect': boardViewport.style.cursor = 'crosshair'; break;
      default: boardViewport.style.cursor = 'default';
    }
  }

  function handleToolbarClick(e) {
    const button = e.target.closest('.tool-btn');
    const colorBtn = e.target.closest('.color-btn:not(.custom-color)');
    const strokeBtn = e.target.closest('.stroke-btn');
    const dropdownItem = e.target.closest('.dropdown-item');

    if (button) {
      const toolId = button.id;
      if (toolId.endsWith('-tool-btn')) {
        const toolName = toolId.replace('-tool-btn', '');
        if (['select', 'hand', 'draw', 'erase', 'text', 'shape', 'connect'].includes(toolName)) {
          activateTool(toolName);
        }
      } else if (toolId === 'add-card-btn') {
        const center = getViewportCenterWorld();
        addCard('Новая карточка...', center.x - 125, center.y - 75);
      } else if (toolId === 'add-image-btn') {
        imgUploadInput.click();
      } else if (toolId === 'undo-btn') {
        // undo();
      } else if (toolId === 'redo-btn') {
        // redo();
      } else if (toolId === 'zoom-out-btn') {
        zoom(1 / 1.2);
      } else if (toolId === 'zoom-in-btn') {
        zoom(1.2);
      } else if (toolId === 'fit-screen-btn') {
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
        console.log('Dropdown item clicked:', dropdownItem.textContent.trim());
        // Close dropdown (optional)
        const dropdown = dropdownItem.closest('.dropdown');
        if (dropdown) dropdown.querySelector('.dropdown-menu').style.display = 'none';
        setTimeout(() => { if(dropdown) dropdown.querySelector('.dropdown-menu').style.display = ''; }, 100); // Allow hover state to reset
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
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = true;
  }

  function redrawDrawingCanvas() {
    const viewportWidth = drawingCanvas.width / (window.devicePixelRatio || 1);
    const viewportHeight = drawingCanvas.height / (window.devicePixelRatio || 1);
    ctx.clearRect(0, 0, viewportWidth, viewportHeight);

    ctx.save();
    ctx.translate(worldOffsetX, worldOffsetY);
    ctx.scale(worldScale, worldScale);

    // Draw committed paths
    drawingPaths.forEach(path => drawPathObject(path));

    // Draw current path (if drawing/erasing)
    if (isCurrentlyDrawing && currentDrawingPath.points && currentDrawingPath.points.length > 0) {
      drawPathObject(currentDrawingPath);
    }

    ctx.restore();
  }

  function drawPathObject(pathObj) {
    if (!pathObj.points || pathObj.points.length < 1) return;
    ctx.beginPath();
    ctx.strokeStyle = pathObj.color;
    // Adjust line width based on scale, but ensure minimum visibility
    ctx.lineWidth = Math.max(0.5 / worldScale, pathObj.lineWidth / worldScale);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.moveTo(pathObj.points[0].x, pathObj.points[0].y);
    for (let i = 1; i < pathObj.points.length; i++) {
      ctx.lineTo(pathObj.points[i].x, pathObj.points[i].y);
    }
    ctx.stroke();
  }

  function startDrawing(e) {
    isCurrentlyDrawing = true;
    const worldPos = viewportToWorld(e.clientX, e.clientY);

    if (activeTool === 'draw') {
      currentDrawingPath = {
        id: `draw-${Date.now()}`,
        color: drawingColor,
        lineWidth: drawingLineWidth,
        points: [{ x: worldPos.x, y: worldPos.y }]
      };
    } else if (activeTool === 'erase') {
      currentDrawingPath = { // Temporary path for eraser visualization (optional)
        id: `erase-${Date.now()}`,
        color: 'rgba(255, 0, 0, 0.3)', // Visual feedback for eraser
        lineWidth: drawingLineWidth,
        points: [{ x: worldPos.x, y: worldPos.y }]
      };
      performErasure(worldPos.x, worldPos.y, drawingLineWidth / worldScale);
    }
  }

  function continueDrawing(e) {
    if (!isCurrentlyDrawing) return;
    const worldPos = viewportToWorld(e.clientX, e.clientY);
    currentDrawingPath.points.push({ x: worldPos.x, y: worldPos.y });

    if (activeTool === 'erase') {
      performErasure(worldPos.x, worldPos.y, drawingLineWidth / worldScale);
    }

    redrawDrawingCanvas(); // Redraw includes the current path
  }

  function stopDrawing(discard = false) {
    if (!isCurrentlyDrawing) return;
    isCurrentlyDrawing = false;

    if (!discard && activeTool === 'draw' && currentDrawingPath.points && currentDrawingPath.points.length > 1) {
      drawingPaths.push(currentDrawingPath);
      // Add to history for undo/redo
      // recordHistory({ type: 'add-path', path: currentDrawingPath });
    }
    
    currentDrawingPath = {};
    redrawDrawingCanvas(); // Final redraw without the temporary path
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
    const eraseRadiusSq = eraseRadiusWorld * eraseRadiusWorld;

    for (let i = drawingPaths.length - 1; i >= 0; i--) {
      const path = drawingPaths[i];
      let pathHit = false;
      // Check distance from point to line segments for better accuracy
      for (let j = 0; j < path.points.length; j++) {
          const pt = path.points[j];
          const dx = pt.x - worldX;
          const dy = pt.y - worldY;
          if ((dx * dx + dy * dy) < eraseRadiusSq) {
              pathHit = true;
              break;
          }
          // Add segment check here if needed
      }

      if (pathHit) {
        // recordHistory({ type: 'remove-path', path: drawingPaths[i], index: i });
        drawingPaths.splice(i, 1);
        changed = true;
      }
    }
    if (changed) {
      redrawDrawingCanvas();
    }
  }

  // --- Card Management ---
  function createCardElement(id, x, y, width = 250, height) {
    const card = document.createElement('div');
    card.className = 'card';
    card.dataset.id = id;
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
    card.style.width = `${width}px`;
    if (height) card.style.height = `${height}px`;

    // Card Header (optional, for color tag and actions)
    const cardHeader = document.createElement('div');
    cardHeader.className = 'card-header';
    const cardColorTag = document.createElement('div');
    cardColorTag.className = 'card-color'; // Style this with card data
    const cardActions = document.createElement('div');
    cardActions.className = 'card-actions';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'card-btn close-btn';
    closeBtn.title = 'Удалить';
    closeBtn.innerHTML = '<i class="ri-close-line"></i>';
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      boardWorld.removeChild(card);
      // recordHistory({ type: 'remove-card', cardData: getCardData(card) });
    };
    cardActions.appendChild(closeBtn);
    cardHeader.appendChild(cardColorTag);
    cardHeader.appendChild(cardActions);
    card.appendChild(cardHeader);

    // Card Content Area
    const cardContent = document.createElement('div');
    cardContent.className = 'card-content';
    card.appendChild(cardContent);

    // Resizer
    const resizer = document.createElement('div');
    resizer.className = 'card-resizer';
    card.appendChild(resizer);
    resizer.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        startResizingCard(e, card);
    });

    // Dragging (handled in board mousedown)
    card.addEventListener('mousedown', (e) => {
        if (activeTool === 'select' && e.button === 0 && !e.target.closest('.card-resizer, .card-actions, textarea, .markdown-preview')) {
            // Bring card to front
            bringToFront(card);
        }
    });

    return card;
  }

  function addCard(content = '', x = 100, y = 100, id = `card-${cardIdCounter++}`, width, height, type = 'text') {
    const card = createCardElement(id, x, y, width, height);
    const cardContentEl = card.querySelector('.card-content');

    if (type === 'text') {
      const textarea = document.createElement('textarea');
      const previewDiv = document.createElement('div');
      previewDiv.className = 'markdown-preview';
      textarea.placeholder = 'Введите текст...';

      function switchToPreview() {
        card.dataset.markdownContent = textarea.value;
        previewDiv.style.display = 'block';
        textarea.style.display = 'none';
        try {
            previewDiv.innerHTML = marked.parse(card.dataset.markdownContent || '*Пусто*');
        } catch (err) {
            previewDiv.innerHTML = 'Ошибка рендеринга Markdown';
            console.error("Markdown parsing error:", err);
        }
        // addCheckboxHandlers(previewDiv, card); // Add if needed
      }

      function switchToEdit() {
        previewDiv.style.display = 'none';
        textarea.style.display = 'block';
        textarea.value = card.dataset.markdownContent || '';
        textarea.focus();
        // Auto-resize textarea
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
      }

      textarea.addEventListener('input', () => {
          textarea.style.height = 'auto';
          textarea.style.height = textarea.scrollHeight + 'px';
      });
      textarea.value = content;
      card.dataset.markdownContent = content;
      previewDiv.ondblclick = switchToEdit;
      textarea.onblur = switchToPreview;
      textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          textarea.blur();
        }
      });

      cardContentEl.appendChild(previewDiv);
      cardContentEl.appendChild(textarea);
      switchToPreview(); // Start in preview mode

    } else if (type === 'img') {
      const img = document.createElement('img');
      img.src = content; // content is the data URL or path
      img.style.maxWidth = '100%';
      img.style.display = 'block';
      img.onload = () => {
        if (!height) { // Auto-adjust height based on image aspect ratio if not provided
          const aspectRatio = img.naturalHeight / img.naturalWidth;
          const currentWidth = card.offsetWidth - 32; // Account for padding
          card.style.height = `${currentWidth * aspectRatio + 60}px`; // Add padding/header height
        }
      };
      img.onerror = () => { img.alt = 'Не удалось загрузить изображение'; };
      cardContentEl.appendChild(img);
    }

    boardWorld.appendChild(card);
    bringToFront(card);
    // recordHistory({ type: 'add-card', cardData: getCardData(card) });
    return card;
  }

  function addImageCardWrapper(files) {
    if (!files || !files[0]) return;
    const file = files[0];
    const reader = new FileReader();
    reader.onload = (e) => {
      const center = getViewportCenterWorld();
      addCard(e.target.result, center.x - 150, center.y - 100, undefined, 300, undefined, 'img');
    };
    reader.readAsDataURL(file);
    imgUploadInput.value = ''; // Reset input
  }

  let dragOffsetX, dragOffsetY, draggedCard, initialCardX, initialCardY;
  function startDraggingCard(e, card) {
    isDraggingCard = true;
    draggedCard = card;
    draggedCard.classList.add('dragging');
    bringToFront(draggedCard);
    const cardRect = card.getBoundingClientRect();
    // Calculate offset from mouse click to card's top-left corner in viewport space
    dragOffsetX = e.clientX - cardRect.left;
    dragOffsetY = e.clientY - cardRect.top;
    // Store initial world position
    initialCardX = parseFloat(card.style.left);
    initialCardY = parseFloat(card.style.top);
  }

  function dragCard(e) {
    if (!isDraggingCard || !draggedCard) return;
    // Calculate new viewport position based on mouse and initial offset
    const newViewportX = e.clientX - dragOffsetX;
    const newViewportY = e.clientY - dragOffsetY;
    // Convert viewport position to world position
    const worldPos = viewportToWorld(newViewportX, newViewportY, true); // Pass true to ignore offset
    draggedCard.style.left = `${worldPos.x}px`;
    draggedCard.style.top = `${worldPos.y}px`;
  }

  function stopDraggingCard() {
    if (!isDraggingCard || !draggedCard) return;
    draggedCard.classList.remove('dragging');
    // Record final position for history?
    // const finalCardX = parseFloat(draggedCard.style.left);
    // const finalCardY = parseFloat(draggedCard.style.top);
    // if (finalCardX !== initialCardX || finalCardY !== initialCardY) {
    //     recordHistory({ type: 'move-card', cardId: draggedCard.dataset.id, from: {x: initialCardX, y: initialCardY}, to: {x: finalCardX, y: finalCardY} });
    // }
    isDraggingCard = false;
    draggedCard = null;
  }

  let resizeCardEl, initialCardWidth, initialCardHeight, resizeStartX, resizeStartY;
  function startResizingCard(e, card) {
    isResizingCard = true;
    resizeCardEl = card;
    resizeCardEl.classList.add('resizing');
    initialCardWidth = card.offsetWidth;
    initialCardHeight = card.offsetHeight;
    resizeStartX = e.clientX;
    resizeStartY = e.clientY;
    document.addEventListener('mousemove', resizeCard);
    document.addEventListener('mouseup', stopResizingCard);
  }

  function resizeCard(e) {
    if (!isResizingCard || !resizeCardEl) return;
    const dx = (e.clientX - resizeStartX) / worldScale;
    const dy = (e.clientY - resizeStartY) / worldScale;
    resizeCardEl.style.width = `${Math.max(150, initialCardWidth + dx)}px`;
    resizeCardEl.style.height = `${Math.max(100, initialCardHeight + dy)}px`;
    // Trigger resize on internal elements if necessary (e.g., textarea)
    const textarea = resizeCardEl.querySelector('textarea');
    if (textarea) {
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
    }
  }

  function stopResizingCard() {
    if (!isResizingCard || !resizeCardEl) return;
    resizeCardEl.classList.remove('resizing');
    document.removeEventListener('mousemove', resizeCard);
    document.removeEventListener('mouseup', stopResizingCard);
    // Record history?
    isResizingCard = false;
    resizeCardEl = null;
  }

  function bringToFront(element) {
    // Simple z-index increment
    const maxZ = Array.from(boardWorld.children).reduce((max, child) => {
        const z = parseInt(child.style.zIndex) || 0;
        return Math.max(max, z);
    }, 10); // Start above canvas/grid
    element.style.zIndex = maxZ + 1;
  }

  // --- Context Menu ---
  function handleContextMenu(e) {
    e.preventDefault();
    const target = e.target;
    const isCardContent = target.closest('.card textarea, .card .markdown-preview');
    
    // Allow native context menu for text editing inside cards
    if (isCardContent) {
        hideContextMenu();
        return; 
    }

    contextMenuX = e.clientX;
    contextMenuY = e.clientY;
    contextMenuEl.style.left = `${contextMenuX}px`;
    contextMenuEl.style.top = `${contextMenuY}px`;
    contextMenuEl.style.display = 'block';
    contextMenuVisible = true;
  }

  function hideContextMenu() {
    if (contextMenuVisible) {
      contextMenuEl.style.display = 'none';
      contextMenuVisible = false;
    }
  }

  function handleClickOutside(e) {
    if (contextMenuVisible && !contextMenuEl.contains(e.target)) {
      hideContextMenu();
    }
    // Deselect elements if clicking on empty space
    if (activeTool === 'select' && !e.target.closest('.card, .toolbar, .sidebar, .context-menu, .minimap-container')) {
        selectedElements.clear();
        // Remove selection visuals from cards
        document.querySelectorAll('.card.selected').forEach(c => c.classList.remove('selected'));
    }
  }
  
  function handleContextMenuAction(e) {
      const item = e.target.closest('.context-menu-item');
      if (!item) return;
      
      const action = item.dataset.action;
      const worldPos = viewportToWorld(contextMenuX, contextMenuY);
      
      switch(action) {
          case 'add-text':
              addCard('Новый текст...', worldPos.x, worldPos.y);
              break;
          case 'add-image':
              imgUploadInput.dataset.posX = worldPos.x; // Store position for later use
              imgUploadInput.dataset.posY = worldPos.y;
              imgUploadInput.click();
              break;
          case 'paste':
              pasteAtLocation(worldPos.x, worldPos.y);
              break;
          // Add other actions: add-shape, select-all, create-group, add-bookmark
          default:
              console.log('Context menu action:', action);
      }
      
      hideContextMenu();
  }
  
  async function pasteAtLocation(worldX, worldY) {
      try {
          const clipboardItems = await navigator.clipboard.read();
          for (const item of clipboardItems) {
              if (item.types.includes('text/plain')) {
                  const blob = await item.getType('text/plain');
                  const text = await blob.text();
                  addCard(text, worldX, worldY);
                  break; // Paste first text item
              } else if (item.types.find(type => type.startsWith('image/'))) {
                  const imageType = item.types.find(type => type.startsWith('image/'));
                  const blob = await item.getType(imageType);
                  const reader = new FileReader();
                  reader.onload = (e) => {
                      addCard(e.target.result, worldX, worldY, undefined, 300, undefined, 'img');
                  };
                  reader.readAsDataURL(blob);
                  break; // Paste first image item
              }
          }
      } catch (err) {
          console.error('Failed to read clipboard contents: ', err);
          alert('Не удалось вставить из буфера обмена. Возможно, требуется разрешение.');
      }
  }

  // --- Minimap ---
  function updateMinimap() {
    if (!boardWorld.children.length) {
        minimapContainer.style.display = 'none';
        return; // Hide minimap if board is empty
    }
    minimapContainer.style.display = 'block';

    const worldBounds = getBoardWorldBounds();
    const viewportRect = boardViewport.getBoundingClientRect();

    // Calculate scale factor for minimap
    const scaleX = minimapEl.clientWidth / worldBounds.width;
    const scaleY = minimapEl.clientHeight / worldBounds.height;
    const minimapScale = Math.min(scaleX, scaleY) * 0.9; // Add some padding

    // Calculate viewport representation on minimap
    const minimapViewportWidth = viewportRect.width / worldScale * minimapScale;
    const minimapViewportHeight = viewportRect.height / worldScale * minimapScale;
    const minimapViewportX = (-worldOffsetX / worldScale - worldBounds.minX) * minimapScale;
    const minimapViewportY = (-worldOffsetY / worldScale - worldBounds.minY) * minimapScale;

    minimapViewportEl.style.width = `${minimapViewportWidth}px`;
    minimapViewportEl.style.height = `${minimapViewportHeight}px`;
    minimapViewportEl.style.left = `${minimapViewportX}px`;
    minimapViewportEl.style.top = `${minimapViewportY}px`;

    // Store scales for drag calculation
    minimapViewportEl.dataset.minimapScale = minimapScale;
    minimapViewportEl.dataset.worldMinX = worldBounds.minX;
    minimapViewportEl.dataset.worldMinY = worldBounds.minY;
  }

  function getBoardWorldBounds() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    if (boardWorld.children.length === 0) {
        // Default bounds if empty
        const center = getViewportCenterWorld();
        return { minX: center.x - 500, minY: center.y - 500, maxX: center.x + 500, maxY: center.y + 500, width: 1000, height: 1000 };
    }
    
    Array.from(boardWorld.children).forEach(el => {
      const x = parseFloat(el.style.left);
      const y = parseFloat(el.style.top);
      const w = el.offsetWidth;
      const h = el.offsetHeight;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + w);
      maxY = Math.max(maxY, y + h);
    });
    // Add drawing bounds later if needed
    
    // Add padding
    const padding = 200;
    minX -= padding; minY -= padding; maxX += padding; maxY += padding;

    return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
  }

  let minimapDragStartX, minimapDragStartY;
  function handleMinimapMouseDown(e) {
      if (e.button !== 0) return;
      isDraggingMinimap = true;
      minimapDragStartX = e.clientX;
      minimapDragStartY = e.clientY;
      document.addEventListener('mousemove', dragMinimap);
      document.addEventListener('mouseup', stopDraggingMinimap);
      e.stopPropagation();
  }

  function dragMinimap(e) {
      if (!isDraggingMinimap) return;
      const dx = e.clientX - minimapDragStartX;
      const dy = e.clientY - minimapDragStartY;
      
      const minimapScale = parseFloat(minimapViewportEl.dataset.minimapScale);
      const worldMinX = parseFloat(minimapViewportEl.dataset.worldMinX);
      const worldMinY = parseFloat(minimapViewportEl.dataset.worldMinY);
      
      // Convert minimap pixel movement to world coordinate movement
      const worldDx = -dx / minimapScale;
      const worldDy = -dy / minimapScale;
      
      // Update world offset based on the drag
      // Need to calculate the new offset based on the change in the minimap viewport's top-left corner
      const currentMinimapX = parseFloat(minimapViewportEl.style.left);
      const currentMinimapY = parseFloat(minimapViewportEl.style.top);
      
      const newMinimapX = currentMinimapX + dx;
      const newMinimapY = currentMinimapY + dy;
      
      // Convert new minimap position back to world offset
      worldOffsetX = -( (newMinimapX / minimapScale) + worldMinX ) * worldScale;
      worldOffsetY = -( (newMinimapY / minimapScale) + worldMinY ) * worldScale;
      
      applyWorldTransform();
      
      // Update start position for next move event
      minimapDragStartX = e.clientX;
      minimapDragStartY = e.clientY;
  }

  function stopDraggingMinimap() {
      isDraggingMinimap = false;
      document.removeEventListener('mousemove', dragMinimap);
      document.removeEventListener('mouseup', stopDraggingMinimap);
  }

  // --- Sidebar ---
  function toggleSidebar() {
    sidebar.classList.toggle('collapsed');
    // Adjust main content margin
    document.querySelector('.main-content').style.marginLeft = sidebar.classList.contains('collapsed')
      ? `${sidebar.offsetWidth}px` // Use actual width after transition
      : `${sidebar.offsetWidth}px`;
    // Recalculate canvas size after transition
    setTimeout(() => {
        handleResize();
    }, 300); // Match CSS transition duration
  }

  // --- Modals ---
  function openModal(modal) {
    modal.classList.add('active');
  }

  function closeModal(modal) {
    modal.classList.remove('active');
  }

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
    // Ignore if typing in inputs/textareas
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA' || document.activeElement.isContentEditable) return;

    switch (e.key.toLowerCase()) {
      case 'v': activateTool('select'); break;
      case 'h': activateTool('hand'); break;
      case 'b': activateTool('draw'); break;
      case 'e': activateTool('erase'); break;
      case 't': activateTool('text'); break;
      case 's': activateTool('shape'); break; // Placeholder
      case 'c': activateTool('connect'); break; // Placeholder
      case 'n': 
          const center = getViewportCenterWorld();
          addCard('Новая карточка...', center.x - 125, center.y - 75);
          break;
      case 'i': imgUploadInput.click(); break;
      case '+':
      case '=': zoom(1.2); break;
      case '-': zoom(1 / 1.2); break;
      case 'z':
        if (e.ctrlKey || e.metaKey) {
          // undo();
          e.preventDefault();
        }
        break;
      case 'y':
        if (e.ctrlKey || e.metaKey) {
          // redo();
          e.preventDefault();
        }
        break;
      case 's':
          if (e.ctrlKey || e.metaKey) {
              // saveBoard();
              e.preventDefault();
          }
          break;
      case 'o':
          if (e.ctrlKey || e.metaKey) {
              // loadBoard();
              e.preventDefault();
          }
          break;
      case 'delete':
      case 'backspace':
          // Delete selected elements
          // deleteSelected();
          break;
    }
  }

  function handleResize() {
    setupDrawingCanvas();
    applyWorldTransform(); // Redraws canvas and updates minimap
  }

  // --- Save/Load (Basic Placeholder) ---
  function getCardData(cardElement) {
      const isImg = !!cardElement.querySelector('img');
      return {
          id: cardElement.dataset.id,
          type: isImg ? 'img' : 'text',
          x: parseFloat(cardElement.style.left),
          y: parseFloat(cardElement.style.top),
          width: cardElement.offsetWidth,
          height: cardElement.offsetHeight,
          content: isImg ? cardElement.querySelector('img').src : cardElement.dataset.markdownContent,
          zIndex: cardElement.style.zIndex || 10
          // Add color, tags etc. later
      };
  }
  
  function saveBoardToStorage() {
      const data = {
          cards: Array.from(boardWorld.querySelectorAll('.card')).map(getCardData),
          drawing: drawingPaths,
          viewport: { offsetX: worldOffsetX, offsetY: worldOffsetY, scale: worldScale },
          cardIdCounter: cardIdCounter
      };
      localStorage.setItem('mindCanvasBoard', JSON.stringify(data));
      console.log('Board saved to localStorage');
  }
  
  function loadBoardFromStorage() {
      const savedData = localStorage.getItem('mindCanvasBoard');
      if (!savedData) return;
      
      try {
          const data = JSON.parse(savedData);
          
          // Clear existing board
          boardWorld.innerHTML = '';
          drawingPaths = [];
          
          // Load viewport
          if (data.viewport) {
              worldOffsetX = data.viewport.offsetX || 0;
              worldOffsetY = data.viewport.offsetY || 0;
              worldScale = data.viewport.scale || 1;
          }
          
          // Load cards
          if (data.cards) {
              data.cards.forEach(c => {
                  const card = addCard(c.content, c.x, c.y, c.id, c.width, c.height, c.type);
                  card.style.zIndex = c.zIndex || 10;
              });
          }
          
          // Load drawings
          if (data.drawing) {
              drawingPaths = data.drawing;
          }
          
          cardIdCounter = data.cardIdCounter || 0;
          
          applyWorldTransform();
          console.log('Board loaded from localStorage');
          
      } catch (err) {
          console.error('Error loading board from localStorage:', err);
          localStorage.removeItem('mindCanvasBoard'); // Clear corrupted data
      }
  }
  
  // --- Auto-save (Example) ---
  // setInterval(saveBoardToStorage, 30000); // Save every 30 seconds

  // --- Start the application ---
  init();
});

