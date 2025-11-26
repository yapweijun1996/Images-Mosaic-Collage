import { mountImgCollage } from './components/ImgCollage';

const collageBlocks = Array.from(
  document.querySelectorAll<HTMLElement>('.img_collage')
);

const parseImageList = (value?: string) =>
  value
    ?.split(',')
    .map((src) => src.trim())
    .filter(Boolean);

const parseNumberAttr = (value?: string) => {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const parseGapValue = (value?: string) => {
  if (!value) return undefined;
  const parsed = parseFloat(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }
  return parsed;
};

const getInlineDimension = (
  element: HTMLElement,
  property: 'width' | 'height'
) => {
  const inlineValue = element.style[property];
  if (inlineValue) {
    const parsed = parseFloat(inlineValue);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  const rect = element.getBoundingClientRect();
  const size = property === 'width' ? rect.width : rect.height;
  return size > 0 ? size : undefined;
};

collageBlocks.forEach((block) => {
  const width =
    parseNumberAttr(block.dataset.width) ??
    getInlineDimension(block, 'width') ??
    720;
  const height =
    parseNumberAttr(block.dataset.height) ??
    getInlineDimension(block, 'height') ??
    560;
  const customImages = parseImageList(block.dataset.images);
  const gap = parseGapValue(block.dataset.gapsImages);

  if (!customImages || customImages.length === 0) {
    throw new Error(
      'Each .img_collage must define at least one image via data-images'
    );
  }

  mountImgCollage(block, {
    images: customImages,
    width,
    height,
    gap,
  });
});
