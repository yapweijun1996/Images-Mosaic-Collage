export interface ImgCollageOptions {
  images: string[];
  width?: number;
  height?: number;
  className?: string;
  onImageClick?: (index: number) => void;
  gap?: number;
  enableDrag?: boolean;
  enableResize?: boolean;
  minImageSize?: number;
}

const defaultGap = 2;

/** Try to read the aspect ratio from a Picsum style URL */
const getAspectRatioFromUrl = (src: string): number | null => {
  const match = /picsum\.photos\/.*\/(\d+)\/(\d+)(?:\/)?$/.exec(src);
  if (!match) return null;
  const w = parseInt(match[1], 10);
  const h = parseInt(match[2], 10);
  return h === 0 ? null : w / h;
};

// Core Algorithm: Compute Justified Mosaic Layout
const computeMosaicLayout = (
  images: string[],
  ratios: Record<string, number>,
  containerWidth: number,
  containerHeight: number,
  gap: number = defaultGap
) => {
  if (images.length === 0) {
    return { items: [], totalHeight: 0, scale: 1, topOffset: 0, leftOffset: 0 };
  }

  // 1. Prepare items with their Aspect Ratios (priority: loaded > url > default 1.5)
  const items = images.map((src, index) => {
    const r = ratios[src] || getAspectRatioFromUrl(src) || 1.5;
    return { src, index, ratio: r };
  });

  const totalRatio = items.reduce((sum, item) => sum + item.ratio, 0);
  const containerRatio = containerWidth / containerHeight;

  // 2. Determine Ideal Number of Rows (K)
  let K = Math.round(Math.sqrt(totalRatio / containerRatio));
  K = Math.max(1, Math.min(K, items.length));

  // 3. Partition items into K rows
  const rows: { items: typeof items; sumRatio: number }[] = [];
  
  if (K === 1) {
    rows.push({ items, sumRatio: totalRatio });
  } else {
    const idealRatioPerRow = totalRatio / K;
    let currentSlice: typeof items = [];
    let currentSum = 0;

    items.forEach((item, i) => {
      currentSlice.push(item);
      currentSum += item.ratio;

      if (i === items.length - 1) {
        rows.push({ items: currentSlice, sumRatio: currentSum });
        return;
      }

      if (rows.length < K - 1) {
        const currentDiff = Math.abs(currentSum - idealRatioPerRow);
        const nextRatio = items[i + 1].ratio;
        const nextDiff = Math.abs((currentSum + nextRatio) - idealRatioPerRow);

        if (nextDiff > currentDiff) {
          rows.push({ items: currentSlice, sumRatio: currentSum });
          currentSlice = [];
          currentSum = 0;
        }
      }
    });
  }

  // 4. Calculate Geometry
  type RowLayout = {
    height: number;
    items: { index: number; src: string; x: number; width: number; height: number }[];
  };

  const rowLayouts: RowLayout[] = [];

  rows.forEach((row) => {
    if (row.items.length === 0) return;

    const availableWidth = containerWidth - (row.items.length - 1) * gap;
    const rowHeight = availableWidth / row.sumRatio;

    const rowLayout: RowLayout = { height: rowHeight, items: [] };
    let currentX = 0;
    row.items.forEach((item) => {
      const itemWidth = item.ratio * rowHeight;
      rowLayout.items.push({
        index: item.index,
        src: item.src,
        x: currentX,
        width: itemWidth,
        height: rowHeight,
      });
      currentX += itemWidth + gap;
    });

    rowLayouts.push(rowLayout);
  });

  const rowSpacingCount = Math.max(0, rowLayouts.length - 1);
  const sumRowHeights = rowLayouts.reduce((sum, row) => sum + row.height, 0);

  let verticalGap = gap;
  let totalHeight = sumRowHeights + verticalGap * rowSpacingCount;

  if (rowSpacingCount > 0 && totalHeight < containerHeight) {
    const extra = containerHeight - totalHeight;
    verticalGap = gap + extra / rowSpacingCount;
    totalHeight = sumRowHeights + verticalGap * rowSpacingCount;
  }

  const layoutItems: {
    index: number;
    src: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }[] = [];

  let currentY = 0;
  rowLayouts.forEach((row) => {
    row.items.forEach((item) => {
      layoutItems.push({
        ...item,
        y: currentY,
      });
    });
    currentY += row.height + verticalGap;
  });
  if (layoutItems.length > 0) {
    currentY -= verticalGap;
  }

  // 5. Fit to Container
  let scale = 1;
  if (totalHeight > containerHeight) {
    scale = containerHeight / totalHeight;
  }

  const finalWidth = containerWidth * scale;
  const finalHeight = totalHeight * scale;
  const leftOffset = (containerWidth - finalWidth) / 2;
  const topOffset = (containerHeight - finalHeight) / 2;

  return { items: layoutItems, totalHeight, scale, topOffset, leftOffset };
};

interface LayoutResult {
  items: {
    index: number;
    src: string;
    x: number;
    y: number;
    width: number;
    height: number;
  }[];
  totalHeight: number;
  scale: number;
  topOffset: number;
  leftOffset: number;
}

const ensureBaseLayout = (target: HTMLElement, className?: string) => {
  target.style.position = 'relative';
  target.style.overflow = 'hidden';
  target.style.display = 'block';
  if (!className) return;
  className
    .split(/\s+/)
    .filter(Boolean)
    .forEach((cls) => target.classList.add(cls));
};

export const mountImgCollage = (
  target: HTMLElement,
  options: ImgCollageOptions
) => {
  let state: ImgCollageOptions = { ...options };
  const loadedRatios: Record<string, number> = {};
  const pendingLoads = new Set<string>();
  let destroyed = false;

  ensureBaseLayout(target, state.className);

  const render = () => {
    const {
      images,
      width = 400,
      height = 500,
      onImageClick,
      gap,
      enableDrag = false,
      enableResize = false,
      minImageSize = 50,
    } = state;
    target.style.width = `${width}px`;
    target.style.height = `${height}px`;
    target.innerHTML = '';

    if (images.length === 0) {
      target.textContent = 'No Images';
      return;
    }

    const layout: LayoutResult = computeMosaicLayout(
      images,
      loadedRatios,
      width,
      height,
      gap ?? defaultGap
    );

    const normalizedMinSize = Math.max(10, minImageSize);
    const clamp = (value: number, min: number, max: number) =>
      Math.min(Math.max(value, min), max);

    const stage = document.createElement('div');
    stage.style.position = 'relative';
    stage.style.width = `${width}px`;
    stage.style.height = `${height}px`;
    stage.style.userSelect = 'none';

    const attachDragHandlers = (wrapper: HTMLElement) => {
      let startX = 0;
      let startY = 0;
      let initialLeft = 0;
      let initialTop = 0;
      let dragging = false;

      const handlePointerMove = (event: PointerEvent) => {
        if (!dragging) return;
        const dx = event.clientX - startX;
        const dy = event.clientY - startY;
        const wrapperWidth = parseFloat(wrapper.style.width) || 0;
        const wrapperHeight = parseFloat(wrapper.style.height) || 0;
        const maxLeft = Math.max(0, width - wrapperWidth);
        const maxTop = Math.max(0, height - wrapperHeight);
        const nextLeft = clamp(initialLeft + dx, 0, maxLeft);
        const nextTop = clamp(initialTop + dy, 0, maxTop);
        wrapper.style.left = `${nextLeft}px`;
        wrapper.style.top = `${nextTop}px`;
      };

      const handlePointerUp = () => {
        if (!dragging) return;
        dragging = false;
        wrapper.style.zIndex = '';
        wrapper.style.boxShadow = '';
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };

      const handlePointerDown = (event: PointerEvent) => {
        if (event.button !== 0) return;
        const targetEl = event.target as HTMLElement;
        if (targetEl?.dataset?.resizeHandle === 'true') {
          return;
        }
        dragging = true;
        startX = event.clientX;
        startY = event.clientY;
        initialLeft = parseFloat(wrapper.style.left) || 0;
        initialTop = parseFloat(wrapper.style.top) || 0;
        wrapper.style.zIndex = '1000';
        wrapper.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.3)';
        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        event.preventDefault();
      };

      wrapper.addEventListener('pointerdown', handlePointerDown);
      wrapper.addEventListener('dragstart', (evt) => evt.preventDefault());
    };

    const attachResizeHandle = (wrapper: HTMLElement, ratio: number) => {
      const handle = document.createElement('div');
      handle.dataset.resizeHandle = 'true';
      handle.style.position = 'absolute';
      handle.style.right = '4px';
      handle.style.bottom = '4px';
      handle.style.width = '12px';
      handle.style.height = '12px';
      handle.style.backgroundColor = '#4A90E2';
      handle.style.borderRadius = '50%';
      handle.style.cursor = 'nwse-resize';
      handle.style.boxShadow = '0 0 4px rgba(0, 0, 0, 0.4)';
      handle.style.zIndex = '10';
      handle.style.opacity = '0';
      handle.style.transition = 'opacity 150ms ease';

      let startX = 0;
      let startWidth = 0;
      let resizing = false;

      const handlePointerMove = (event: PointerEvent) => {
        if (!resizing) return;
        const dx = event.clientX - startX;
        const currentLeft = parseFloat(wrapper.style.left) || 0;
        const currentTop = parseFloat(wrapper.style.top) || 0;
        const maxWidthByBounds = Math.min(
          Math.max(normalizedMinSize, width - currentLeft),
          Math.max(normalizedMinSize, (height - currentTop) * ratio)
        );
        const rawWidth = startWidth + dx;
        const nextWidth = clamp(rawWidth, normalizedMinSize, maxWidthByBounds);
        const nextHeight = nextWidth / ratio;
        wrapper.style.width = `${nextWidth}px`;
        wrapper.style.height = `${nextHeight}px`;
      };

      const handlePointerUp = () => {
        if (!resizing) return;
        resizing = false;
        wrapper.style.boxShadow = '';
        window.removeEventListener('pointermove', handlePointerMove);
        window.removeEventListener('pointerup', handlePointerUp);
      };

      handle.addEventListener('pointerdown', (event: PointerEvent) => {
        if (event.button !== 0) return;
        resizing = true;
        startX = event.clientX;
        startWidth = parseFloat(wrapper.style.width) || 0;
        wrapper.style.boxShadow = '0 8px 16px rgba(0, 0, 0, 0.3)';
        handle.style.opacity = '1';
        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        event.stopPropagation();
        event.preventDefault();
      });

      const showHandle = () => {
        handle.style.opacity = '1';
      };

      const hideHandle = () => {
        if (resizing) return;
        handle.style.opacity = '0';
      };

      wrapper.addEventListener('pointerenter', showHandle);
      wrapper.addEventListener('pointerleave', hideHandle);

      wrapper.appendChild(handle);
    };

    layout.items.forEach((item) => {
      const wrapper = document.createElement('div');
      wrapper.style.position = 'absolute';
      wrapper.style.overflow = 'hidden';
      wrapper.style.cursor = onImageClick ? 'pointer' : 'default';
      wrapper.style.userSelect = 'none';
      wrapper.style.touchAction = 'none';
      const scaledWidth = item.width * layout.scale;
      const scaledHeight = item.height * layout.scale;
      const scaledX = layout.leftOffset + item.x * layout.scale;
      const scaledY = layout.topOffset + item.y * layout.scale;

      wrapper.style.top = `${scaledY}px`;
      wrapper.style.left = `${scaledX}px`;
      wrapper.style.width = `${scaledWidth}px`;
      wrapper.style.height = `${scaledHeight}px`;

      if (onImageClick) {
        wrapper.addEventListener('click', () => onImageClick(item.index));
      }

      const img = document.createElement('img');
      img.src = item.src;
      img.alt = '';
      img.style.width = '100%';
      img.style.height = '100%';
      img.style.display = 'block';
      img.style.objectFit = 'cover';
      img.style.pointerEvents = 'none';
      wrapper.appendChild(img);

      if (enableDrag) {
        attachDragHandlers(wrapper);
      }

      if (enableResize) {
        const aspectRatio = scaledWidth / scaledHeight || 1;
        attachResizeHandle(wrapper, aspectRatio);
      }

      stage.appendChild(wrapper);
    });

    target.appendChild(stage);
  };

  const loadMissingRatios = () => {
    state.images.forEach((src) => {
      if (loadedRatios[src]) return;
      if (getAspectRatioFromUrl(src)) return;
      if (pendingLoads.has(src)) return;

      const img = new Image();
      pendingLoads.add(src);
      img.onload = () => {
        pendingLoads.delete(src);
        if (destroyed) return;
        if (img.naturalHeight === 0) return;
        loadedRatios[src] = img.naturalWidth / img.naturalHeight;
        render();
      };
      img.onerror = () => {
        pendingLoads.delete(src);
      };
      img.src = src;
    });
  };

  const update = (next: Partial<ImgCollageOptions>) => {
    state = { ...state, ...next };
    ensureBaseLayout(target, state.className);
    render();
    loadMissingRatios();
  };

  const destroy = () => {
    destroyed = true;
    target.innerHTML = '';
    pendingLoads.clear();
  };

  render();
  loadMissingRatios();

  return { update, destroy };
};
