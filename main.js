import fs from 'fs';
import path from 'path';
import pdfPoppler from 'pdf-poppler';
import Tesseract from 'tesseract.js';

// Load config file
import config from './config.js';

// Input
const folderFrom = config.from;
const folderTo = config.to;

// Output
const folderResult = config.result;

// Create directory if it doesn't exist.
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
  }
}

async function convertPdfToImage(pdfPath, outputFolder, fileName) {
  const options = {
    format: 'png',
    out_dir: outputFolder,
    out_prefix: fileName,
    page: null
  };

  await pdfPoppler.convert(pdfPath, options);
}

// Main Steps I. convert pdf to images.
async function processFolders() {

  // 1. Read paths of pdf files.
  const files1 = fs.readdirSync(folderFrom).filter(file => file.endsWith('.pdf'));
  const files2 = fs.readdirSync(folderTo).filter(file => file.endsWith('.pdf'));

  // 2.Traverse filse
  for (const file of files1) {
    if (files2.includes(file)) {
      // 3. Find file pairs which has the same name.
      const pdfPath1 = path.join(folderFrom, file);
      const pdfPath2 = path.join(folderTo, file);
      const fileNameWithoutExt = path.parse(file).name;

      // 4. Convert PDFs to images      
      //  4.1 Create Output folder if not exist
      ensureDir(`${folderResult}/from/${file}`);
      ensureDir(`${folderResult}/to/${file}`);

      //  4.2 Convert pdf to images of each page.
      await convertPdfToImage(pdfPath1, `${folderResult}/from/${file}`, `${fileNameWithoutExt}`);
      await convertPdfToImage(pdfPath2, `${folderResult}/to/${file}`, `${fileNameWithoutExt}`);
    }
  }
}

// Execute main Step I.
processFolders().catch(err => console.error(err));

// Perform OCR on an image
async function performOcr(imagePath) {
  const worker = await createWorker({
    logger: info => console.log(info), // Optional: log progress
  });

  // Load the language data from the custom path
  await worker.load();
  await worker.loadLanguage('eng');
  await worker.initialize('eng', { langPath: langFolder });

  // Perform OCR
  const { data: { text } } = await worker.recognize(imagePath);

  // Clean up
  await worker.terminate();

  return text;
}

// Main step II. Process all PNG files in the result directory
async function processPngFiles() {
  const directories = fs.readdirSync(folderResult).filter(file => fs.statSync(path.join(folderResult, file)).isDirectory());

  for (const dir of directories) {
    const dirPath = path.join(folderResult, dir);

    // Get all PNG files in the current directory
    const pngFiles = fs.readdirSync(dirPath).filter(file => file.endsWith('.png'));

    for (const pngFile of pngFiles) {
      const pngFilePath = path.join(dirPath, pngFile);
      const jsonFilePath = path.join(dirPath, `${path.parse(pngFile).name}.json`);

      // Perform OCR on the PNG file
      const ocrResult = await performOcr(pngFilePath);

      // Write OCR result to a JSON file
      fs.writeFileSync(jsonFilePath, JSON.stringify({ text: ocrResult }, null, 2));
      console.log(`OCR result for '${pngFile}' written to '${jsonFilePath}'`);
    }
  }
}

// Execute Main step II.
processPngFiles().catch(err => console.error(err));