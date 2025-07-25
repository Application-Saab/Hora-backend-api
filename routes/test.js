// routes/test.js

const text = " WELCOME TO SSEC | ITEG ";
const chars = text.split('');
let pos = 0;

// Color codes for cycling LED
const ledColors = [
  '\x1b[41m', // Red background
  '\x1b[42m', // Green background
  '\x1b[43m', // Yellow background
  '\x1b[44m', // Blue background
  '\x1b[45m', // Magenta background
  '\x1b[46m', // Cyan background
  '\x1b[47m', // White background
];


function printBannerWithLED() {
  // Clear the console
  process.stdout.write('\x1Bc');
  // Print the ASCII banner
 
  // Print a border
  let border = '╔' + '═'.repeat(chars.length * 2) + '╗';
  let bottom = '╚' + '═'.repeat(chars.length * 2) + '╝';
  let ledText = '';

  // LED effect with trailing highlight and color cycling
  for (let i = 0; i < chars.length; i++) {
    if (i === pos) {
      // Main LED (bright, cycling color)
      const color = ledColors[pos % ledColors.length];
      ledText += `${color}\x1b[30m${chars[i]}\x1b[0m `;
    } else if (i === (pos - 1 + chars.length) % chars.length || i === (pos + 1) % chars.length) {
      // Trailing LEDs (dim)
      ledText += `\x1b[100m\x1b[37m${chars[i]}\x1b[0m `;
    } else {
      // Normal text
      ledText += `\x1b[2m${chars[i]}\x1b[0m `;
    }
  }

  // Print the framed LED text
  console.log('\n' + border);
  console.log('║' + ledText + '║');
  console.log(bottom + '\n');

  pos = (pos + 1) % chars.length;
}

// Run the LED effect in an interval
setInterval(printBannerWithLED, 120);
