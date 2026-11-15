import PptxGenJS from 'pptxgenjs';

/** A book's slides as a PowerPoint file: each a picture filling a widescreen (13.333 x 7.5 in) slide. Its text is not editable. */
export async function pptxOf(pictures: Buffer[]): Promise<Buffer> {
  const deck = new PptxGenJS();
  deck.layout = 'LAYOUT_WIDE';
  for (const picture of pictures) {
    deck.addSlide().addImage({ data: `image/jpeg;base64,${picture.toString('base64')}`, x: 0, y: 0, w: '100%', h: '100%' });
  }
  return (await deck.write({ outputType: 'nodebuffer' })) as Buffer;
}
