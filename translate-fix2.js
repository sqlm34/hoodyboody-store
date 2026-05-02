const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname);
const files = [
  path.join(projectRoot, 'data', 'db.json'),
  path.join(projectRoot, 'server.js')
];

const replacements = [
  {
    file: files[0],
    replace: [
      ['ChatGPT Image 15 Apr 2026 г.,', 'ChatGPT Image 15 Apr 2026,'],
      ['Custom: ку', 'Custom: Canvas Shopper'],
      ['Шоппер из canvasа, palette: Pine, files: ChatGPT Image 15 Apr 2026 г., 11_56_17.png', 'Canvas shopper bag, palette: Pine, files: ChatGPT Image 15 Apr 2026, 11_56_17.png'],
      ['Custom: врвре', 'Custom: Denim Sample'],
      ['Custom: авторский мотив', 'Custom: Signature Motif'],
      ['"name": "Белый"', '"name": "White"'],
      ['Капюшон', 'Hood'],
      ['Шоппер из canvasа, palette: Pine, files: ChatGPT Image 15 Apr 2026, 11_56_17.png', 'Canvas shopper bag, palette: Pine, files: ChatGPT Image 15 Apr 2026, 11_56_17.png'],
      ['Рубашка из мягкого denimа с контрастной вышивкой на кармане и воротнике. Акцентная вещь для повседневного образа.', 'Soft denim shirt with contrast embroidery on the pocket and collar. A standout piece for everyday wear.'],
      ['Худи из плотного хлопка, palette: Pine, files: Screenshot 2026-04-15 170139.png', 'Hoodie in heavy cotton, palette: Pine, files: Screenshot 2026-04-15 170139.png'],
      ['Худи из плотного хлопкового футера с ботанической вышивкой и маlinenькой монограммой. Хорошо держит форму и остается мягким после стирки.', 'Hoodie made from thick cotton fleece with botanical embroidery and a small monogram. Keeps its shape and stays soft after washing.'],
      ['Плотный футер, веточка шалфея и маlinenькая монограмма.', 'Dense fleece, sage sprig, and a small monogram.'],
      ['Легкий жакет из льна с мягкой посадкой и вышивкой ирисов. Подходит для капсульного гардероба, летних мероприятий и повседневных образов.', 'Light linen jacket with a soft fit and iris embroidery. Perfect for capsule wardrobes, summer events, and everyday looks.'],
      ['Шоппер из плотного canvasа с ботаническим мотивом. Вмещает ноутбук, документы и ежедневные вещи.', 'Canvas shopper bag with a botanical motif. Fits a laptop, documents, and everyday essentials.'],
      ['"name": "Терракота"', '"name": "Terracotta"']
    ]
  },
  {
    file: files[1],
    replace: [
      ['В корзине ${quantity} шт., доступно ${stock} шт.', 'with ${quantity} in cart, ${stock} available.'],
      ['Отзывы могут оставлять только зарегистрированные клиенты.', 'Only registered customers can post reviews.']
    ]
  }
];

for (const { file, replace } of replacements) {
  let content = fs.readFileSync(file, 'utf8');
  for (const [oldValue, newValue] of replace) {
    const count = content.split(oldValue).length - 1;
    if (count > 0) {
      content = content.split(oldValue).join(newValue);
      console.log(`Replaced ${count} occurrence(s) in ${path.relative(projectRoot, file)}: ${oldValue}`);
    }
  }
  fs.writeFileSync(file, content, 'utf8');
}
