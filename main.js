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

function getAllPngFiles(dirPath) {
  let results = [];

  const list = fs.readdirSync(dirPath);

  list.forEach(file => {
    const filePath = path.join(dirPath, file);
    const stats = fs.statSync(filePath);

    if (stats.isDirectory()) {
      results = results.concat(getAllPngFiles(filePath));
    } else if (stats.isFile() && path.extname(file) === '.png') {
      results.push(filePath);
    }
  });

  return results;
}

// Main Steps I. convert pdf to images.
async function processFolders() {

  // 1. Read paths of pdf files.
  const filesFrom = fs.readdirSync(folderFrom).filter(file => file.endsWith('.pdf'));
  const filesTo = fs.readdirSync(folderTo).filter(file => file.endsWith('.pdf'));

  // 2.Traverse files
  let filesFromNum = filesFrom.length;
  let filesToNum = filesTo.length;

  // Check file number.
  if(filesFromNum != filesToNum) {
    console.warn(`Warning: The number of files does not match. ${filesFromNum}, To files: ${filesToNum}`);
  }

  // 3. Convert PDFs to images
  const convertPromises = [];
  console.log(`Converting PDFs...`);
  let fromCount = 0;
  const fromSum = filesFrom.length;
  let toCount = 0;
  const toSum = filesTo.length;
  for (const file of filesFrom) {
    const pdfPathFrom = path.join(folderFrom, file);

    const fileNameWithoutExt = path.parse(file).name;

    //  3.1 Create Output folder if not exist
    ensureDir(`${folderResult}/from/${file}`);

    //  3.2 Convert pdf to images of each page.
    convertPromises.push(
      convertPdfToImage(pdfPathFrom, `${folderResult}/from/${file}`, `${fileNameWithoutExt}`)
      .then(()=>{
        ++fromCount;
        console.log(`From ${fromCount}/${fromSum}\tTo ${toCount}/${toSum}`);
      }) 
    );
  }

  for (const file of filesTo) {
    const pdfPathTo = path.join(folderTo, file);

    const fileNameWithoutExt = path.parse(file).name;

    //  3.1 Create Output folder if not exist
    ensureDir(`${folderResult}/to/${file}`);

    //  3.2 Convert pdf to images of each page.
    convertPromises.push(
      convertPdfToImage(pdfPathTo, `${folderResult}/to/${file}`, `${fileNameWithoutExt}`)
      .then(()=>{
        ++toCount;
        console.log(`From ${fromCount}/${fromSum}\tTo ${toCount}/${toSum}`);
      }) 
    );
  } 

  await Promise.all(convertPromises);
  console.log("PDFs to PNGs convert complete.");

  // Recognize from PNGs.
  const pngFromFiles = getAllPngFiles(`${folderResult}/from`);
  const pngToFiles = getAllPngFiles(`${folderResult}/from`);

  console.log(`Recognizing: ${pngFromFiles.length + pngToFiles.length} file(s).`);

  let recognizePromises = [];

  let fromResults = new Map;
  let pngFromCount = 0;
  let errorFromCount = 0;
  let pngFromSum = pngFromFiles.length;
  for (const file of pngFromFiles) {
    recognizePromises.push(
      Tesseract.recognize(
        file,
        'jpn+eng',
        {
          cachePath: "./lang"
        }
      ).then((data) => {
        fromResults.set(file.split("\\").slice(-2).join("\\"), data);
        ++pngFromCount;
        console.log(`Recognize(from):\t${pngFromCount}/${pngFromSum},\terror: ${errorFromCount}`);
      }).catch(err => {
        ++errorFromCount;
        console.error('Recognize(from): ', err);
        console.log(`Recognize(from):\t${pngFromCount}/${pngFromSum},\terror: ${errorFromCount}`);
      })
    );
  }



  let toResults = new Map;
  let pngToCount = 0;
  let errorToCount = 0;
  const pngToSum = pngToFiles.length;
  for (const file of pngToFiles) {
    recognizePromises.push(
      Tesseract.recognize(
        file,
        'jpn+eng',
        {
          cachePath: "./lang"
        }
      ).then((data) => {
        toResults.set(file.split("\\").slice(-2).join("\\"), data);
        ++pngToCount;
        console.log(`Recognize(To):  \t${pngToCount}/${pngToSum},\terror: ${errorToCount}`);
      }).catch(err => {
        ++errorToCount;
        console.error('Recognize(To): ', err);
        console.log(`Recognize(To):  \t${pngToCount}/${pngToSum},\terror: ${errorToCount}`);
      })
    );
  }

  await Promise.all(recognizePromises);

}

// Execute main Step I.
processFolders().catch(err => console.error(err));