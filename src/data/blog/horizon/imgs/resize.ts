import sharp from "sharp";
const input = process.argv[2];
const output = process.argv[3];
sharp(input)
  .resize(900, 383, { fit: "cover" })
  .png({ quality: 85 })
  .toFile(output)
  .then(info => console.log("Done:", info.size, "bytes"))
  .catch(e => console.error(e));
