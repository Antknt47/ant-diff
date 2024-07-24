import fs from 'fs';
import path from 'path';
import pdfPoppler from 'pdf-poppler';
import * as tf from '@tensorflow/tfjs';
import * as mobilenet from '@tensorflow-models/mobilenet';
import { createCanvas, loadImage } from 'canvas';
import config from './config.js';

const folder1 = config.from;
const folder2 = config.to;
const tempFolder = config.result;
const outputFolder = tempFolder;

console.log(folder1, folder2, tempFolder);

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
    const canvas = createCanvas(224, 224);
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, 224, 224);
    const imageData = ctx.getImageData(0, 0, 224, 224);

    const imgTensor = tf.browser.fromPixels({
        data: new Uint8Array(imageData.data.buffer),
        width: imageData.width,
        height: imageData.height
    });

    return imgTensor.expandDims(0).toFloat().div(tf.scalar(127)).sub(tf.scalar(1));
}

async function getImageFeatures(model, imagePath) {
    const imgTensor = await loadAndPreprocessImage(imagePath);
    const features = model.infer(imgTensor, 'conv_preds');
    return features;
}

async function cosineSimilarity(features1, features2) {
    const dotProduct = features1.dot(features2.transpose()).dataSync();
    const norm1 = features1.norm().dataSync();
    const norm2 = features2.norm().dataSync();
    const cosSim = dotProduct / (norm1 * norm2);
    return cosSim;
}

async function highlightDifferences(imagePath1, imagePath2, outputImagePath) {
    const img1 = await loadImage(imagePath1);
    const img2 = await loadImage(imagePath2);
    const canvas = createCanvas(img1.width, img1.height);
    const ctx = canvas.getContext('2d');

    ctx.drawImage(img1, 0, 0);
    const imgData1 = ctx.getImageData(0, 0, img1.width, img1.height);

    ctx.drawImage(img2, 0, 0);
    const imgData2 = ctx.getImageData(0, 0, img2.width, img2.height);

    const diffCanvas = createCanvas(img1.width, img1.height);
    const diffCtx = diffCanvas.getContext('2d');
    const diffImageData = diffCtx.createImageData(img1.width, img1.height);

    for (let i = 0; i < imgData1.data.length; i += 4) {
        if (imgData1.data[i] !== imgData2.data[i] || imgData1.data[i + 1] !== imgData2.data[i + 1] || imgData1.data[i + 2] !== imgData2.data[i + 2]) {
            diffImageData.data[i] = 255;  // Red
            diffImageData.data[i + 1] = 0;  // Green
            diffImageData.data[i + 2] = 0;  // Blue
            diffImageData.data[i + 3] = 255;  // Alpha
        } else {
            diffImageData.data[i] = imgData1.data[i];
            diffImageData.data[i + 1] = imgData1.data[i + 1];
            diffImageData.data[i + 2] = imgData1.data[i + 2];
            diffImageData.data[i + 3] = imgData1.data[i + 3];
        }
    }

    diffCtx.putImageData(diffImageData, 0, 0);
    const buffer = diffCanvas.toBuffer('image/png');
    fs.writeFileSync(outputImagePath, buffer);
    console.log(`Saved highlighted differences to ${outputImagePath}`);
}

async function processFolders() {
    const model = await mobilenet.load();

    const files1 = fs.readdirSync(folder1).filter(file => file.endsWith('.pdf'));
    const files2 = fs.readdirSync(folder2).filter(file => file.endsWith('.pdf'));

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

            const features1 = await getImageFeatures(model, image1);
            const features2 = await getImageFeatures(model, image2);

            const sim = await cosineSimilarity(features1, features2);
            const diffPercentage = (1 - sim) * 100;

            console.log(`${file} has a difference of ${diffPercentage.toFixed(2)}%`);

            // Highlight differences
            const outputImagePath = path.join(outputFolder, `${fileNameWithoutExt}_diff.png`);
            await highlightDifferences(image1, image2, outputImagePath);
        }
    }
}

processFolders().catch(err => console.error(err));