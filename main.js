import fs from 'fs';
import path from 'path';
import pdfPoppler from 'pdf-poppler';
import { diffChars, createPatch } from "diff";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import * as Diff2HTML from "diff2html";

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

// Convert PDFs to PNGs.
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

async function extractTextFromPdf(pdfPath) {
  const pdfBuffer = fs.readFileSync(pdfPath);
  const pdfData = new Uint8Array(pdfBuffer);
  const pdf = await getDocument({ data: pdfData }).promise;

  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    if(config.onlyDiffText) {
      fullText += textContent.items.map(item => `${item.str}`).join('\n');
    } else {
      // TODO: make more format check.
      fullText += textContent.items.map(item => `<item font:${item.fontName};>\n\t${item.str}\n</item>`).join('\n');
    }
  }

  return fullText;
}


// Main Steps I. convert pdf to images.
async function processFolders() {

  // 1. Read paths of pdf files.
  const filesFrom = fs.readdirSync(folderFrom).filter(file => file.endsWith('.pdf'));
  const filesTo = fs.readdirSync(folderTo).filter(file => file.endsWith('.pdf'));

  // 2.Traverse files
  let filesFromNum = filesFrom.length;
  let filesToNum = filesTo.length;

  // Count and check file number.
  if(filesFromNum != filesToNum) {
    console.warn(`Warning: The number of files does not match. ${filesFromNum}, To files: ${filesToNum}`);
  }

  // Compare text by pdflib
  let csvContentPdfLib = 'File,From length,To length,Char diff(%)\n'; // CSV head
  for(const file of filesFrom) {
    const pdfPathFrom = path.join(folderFrom, file);
    const pdfPathTo = path.join(folderTo, file);

    const textFrom = await extractTextFromPdf(pdfPathFrom);
    const textTo = await extractTextFromPdf(pdfPathTo);
  
    const diff = diffChars(textFrom, textTo);
  
    let totalDiff = 0;
    diff.forEach(part => {
      if (part.added || part.removed) {
        totalDiff += part.value.length;
      }
    });
  
    const maxLength = Math.max(textFrom.length, textTo.length);
    const differenceRate = maxLength > 0 ? ((totalDiff / maxLength) * 100).toFixed(2) : 0;

    csvContentPdfLib += `${file},${textFrom.length},${textTo.length},${differenceRate}\n`;

    console.log(`Difference rate: ${differenceRate}%`);

    const diffString = createPatch(file, textFrom, textTo);
    const diffHTML = Diff2HTML.html(diffString, {    drawFileList: false,
      fileListToggle: false,
      fileListStartVisible: false,
      fileContentToggle: false,
      matching: 'lines',
      outputFormat: 'side-by-side',
      synchronisedScroll: true,
      highlight: true,
      renderNothingWhenEmpty: false,
    });

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8" />
        <!-- Make sure to load the highlight.js CSS file before the Diff2Html CSS file -->
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/10.7.1/styles/github.min.css" />
        <link
          rel="stylesheet"
          type="text/css"
          href="../../assert/diff2html.min.css"
        />
        <script type="text/javascript" src="../../assert/diff2html-ui.min.js"></script>
      </head>
      <body>
          <div id="diff-container">${diffHTML}</div>
          <script src="../../assets/js/diff2html.min.js"></script>
          <script>
              const diffHtml = document.getElementById('diff-container').innerHTML;
              const diffContainer = document.getElementById('diff-container');
              diffContainer.innerHTML = Diff2Html.html(diffHtml, { drawFileList: true, outputFormat: 'side-by-side' });
          </script>
      </body>
      </html>
    `;

    fs.writeFileSync(`${folderResult}/${file}.html`, htmlContent);
  }
  fs.writeFileSync(`${folderResult}/results.csv`, csvContentPdfLib);

  // 3. Convert PDFs to images (not use, reserved for now)
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
  console.log("PDFs to PNGs convert completed.");
}

// Execute main Step I.
processFolders().catch(err => console.error(err));