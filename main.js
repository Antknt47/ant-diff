import fs from 'fs';
import path from 'path';
import pdfPoppler from 'pdf-poppler';
import { createCanvas, loadImage } from 'canvas';
import config from './config.js';
import cv from '@techstark/opencv-js';

const folder1 = config.from;
const folder2 = config.to;
const tempFolder = config.result;
const outputFolder = tempFolder;

console.log(folder1, folder2, tempFolder);

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
    console.log(`Converted ${pdfPath} to images`);
}

async function loadAndPreprocessImage(imagePath) {
    const img = await loadImage(imagePath);
    const canvas = createCanvas(img.width, img.height);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const imgData = ctx.getImageData(0, 0, img.width, img.height);
    return imgData;
}

async function calculateSSIM(image1Path, image2Path) {
    const imgData1 = await loadAndPreprocessImage(image1Path);
    const imgData2 = await loadAndPreprocessImage(image2Path);

    const mat1 = cv.matFromImageData(imgData1);
    const mat2 = cv.matFromImageData(imgData2);

    const mat1Gray = new cv.Mat();
    const mat2Gray = new cv.Mat();
    cv.cvtColor(mat1, mat1Gray, cv.COLOR_RGBA2GRAY, 0);
    cv.cvtColor(mat2, mat2Gray, cv.COLOR_RGBA2GRAY, 0);

    const ssim = new cv.Mat();
    cv.matchTemplate(mat1Gray, mat2Gray, ssim, cv.TM_CCOEFF_NORMED);

    const result = ssim.floatAt(0, 0);
    mat1.delete();
    mat2.delete();
    mat1Gray.delete();
    mat2Gray.delete();
    ssim.delete();

    return result;
}

async function processFolders() {
    const files1 = fs.readdirSync(folder1).filter(file => file.endsWith('.pdf'));
    const files2 = fs.readdirSync(folder2).filter(file => file.endsWith('.pdf'));
    const csvStream = fs.createWriteStream(tempFolder+"/ssim.csv");
    csvStream.write('File Name,Difference Percentage\n');
    for (const file of files1) {
        if (files2.includes(file)) {
            const pdfPath1 = path.join(folder1, file);
            const pdfPath2 = path.join(folder2, file);
            const fileNameWithoutExt = path.parse(file).name;

            // Convert PDFs to images
            await convertPdfToImage(pdfPath1, tempFolder, `${fileNameWithoutExt}_1`);
            await convertPdfToImage(pdfPath2, tempFolder, `${fileNameWithoutExt}_2`);

            // Compare images (assuming single-page PDFs for simplicity)
            const image1 = path.join(tempFolder, `${fileNameWithoutExt}_1-1.png`);
            const image2 = path.join(tempFolder, `${fileNameWithoutExt}_2-1.png`);

            const ssim = await calculateSSIM(image1, image2);
            const diffPercentage = (1 - ssim) * 100;

            console.log(`${file} has a difference of ${diffPercentage.toFixed(2)}%`);
            csvStream.write(`${file},${diffPercentage.toFixed(2)}\n`);
        }
    }

    csvStream.end();
}

processFolders().catch(err => console.error(err));
