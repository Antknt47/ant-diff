import fs from 'fs';
import path from 'path';
import pdfPoppler from 'pdf-poppler';

// Load config file
import config from './config.js';
import cv from '@techstark/opencv-js';

// Input
const folderFrom = config.from;
const folderTo = config.to;

// Output
const folderResult = config.result;

// Create directory if it doesn't exist.
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`Directory '${dirPath}' created.`);
  } else {
      console.log(`Directory '${dirPath}' already exists.`);
  }
}


function ensureDirectoryExistence(folder) {
    if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true });
    }
}

ensureDirectoryExistence(tempFolder);
ensureDirectoryExistence(outputFolder);

async function convertPdfToImage(pdfPath, outputFolder, fileName) {
  const options = {
    format: 'png',
    out_dir: outputFolder,
    out_prefix: fileName,
    page: null
  };

  await pdfPoppler.convert(pdfPath, options);
}

// Main Steps
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

// Executes main step s
processFolders().catch(err => console.error(err));
