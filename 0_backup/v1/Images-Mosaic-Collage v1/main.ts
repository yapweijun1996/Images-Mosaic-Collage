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

collageBlocks.forEach((block) => {
  const width = Number(block.dataset.width ?? 720);
  const height = Number(block.dataset.height ?? 560);
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
