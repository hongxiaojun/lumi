/** CJK Radicals Supplement → unified Han (Unicode CJKRadicals.txt + PingFang extras). */
const FROM = '⺦⺰⻅⻈⻉⻋⻐⻓⻔⻙⻚⻛⻜⻠⻢⻥⻦⻧⻨⻩⻪⻬⻫⻮⻭⻰⻯⻳⻲⻆⻄⻑⻒⺠⻣⻤⻁⻂⻃⻇⻊⻗⻘⻝⻞⻟⻡⻱'
const TO = '丬纟见讠贝车钅长门韦页风飞饣马鱼鸟卤麦黄黾齐斉齿歯龙竜龟亀角西長長民骨鬼虎衣覀角足雨青食食食首龟'

const RADICALS = new Map<string, string>([...FROM].map((ch, i) => [ch, [...TO][i] ?? ch]))

export function normalizePdfText(text: string): string {
  let out = ''
  for (const ch of text) out += RADICALS.get(ch) ?? ch
  return out.normalize('NFKC')
}
