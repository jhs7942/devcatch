// 관심사를 분야별로 나누고 마지막에 하나의 키워드 배열로 합친다.
const tech = ['HTML', 'AI Agent']
const languages = ['JavaScript', 'TypeScript']
const frontEnd = ['React', 'Next.js']
const backEnd: string[] = []
const infra = ['Docker']

const keywords = [...frontEnd, ...languages, ...tech, ...backEnd, ...infra]

export default keywords
