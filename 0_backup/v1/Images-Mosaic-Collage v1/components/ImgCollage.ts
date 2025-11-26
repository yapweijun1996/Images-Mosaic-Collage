export interface ImgCollageOptions {
  images: string[];
  width?: number;
  height?: number;
  className?: string;
  onImageClick?: (index: number) => void;
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
  const layoutItems: { index: number; src: string; x: number; y: number; width: number; height: number }[] = [];
  let currentY = 0;

  rows.forEach((row) => {
    if (row.items.length === 0) return;

    const availableWidth = containerWidth - (row.items.length - 1) * gap;
    const rowHeight = availableWidth / row.sumRatio;

    let currentX = 0;
    row.items.forEach((item) => {
      const itemWidth = item.ratio * rowHeight;
      layoutItems.push({
        index: item.index,
        src: item.src,
        x: currentX,
        y: currentY,
        width: itemWidth,
        height: rowHeight,
      });
      currentX += itemWidth + gap;
    });

    currentY += rowHeight + gap;
  });

  const totalHeight = currentY > 0 ? currentY - gap : 0;

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
    const { images, width = 400, height = 500, onImageClick } = state;
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
      defaultGap
    );

    const stage = document.createElement('div');
    stage.style.position = 'relative';
    stage.style.width = `${width}px`;
    stage.style.height = `${layout.totalHeight}px`;
    stage.style.transformOrigin = 'top left';
    stage.style.transform = `translate(${layout.leftOffset}px, ${layout.topOffset}px) scale(${layout.scale})`;

    layout.items.forEach((item) => {
      const wrapper = document.createElement('div');
      wrapper.style.position = 'absolute';
      wrapper.style.overflow = 'hidden';
      wrapper.style.cursor = onImageClick ? 'pointer' : 'default';
      wrapper.style.top = `${item.y}px`;
      wrapper.style.left = `${item.x}px`;
      wrapper.style.width = `${item.width}px`;
      wrapper.style.height = `${item.height}px`;

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
