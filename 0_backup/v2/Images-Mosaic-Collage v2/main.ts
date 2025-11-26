import { mountImgCollage } from './components/ImgCollage';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find #root element');
}

const collageBlocks = Array.from(
  rootElement.querySelectorAll<HTMLElement>('.img_collage')
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

  if (!customImages || customImages.length === 0) {
    throw new Error(
      'Each .img_collage must define at least one image via data-images'
    );
  }

  mountImgCollage(block, {
    images: customImages,
    width,
    height,
  });
});
