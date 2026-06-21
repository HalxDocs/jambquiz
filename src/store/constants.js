const SUBJECTS = [
  'Mathematics',
  'Physics',
  'Chemistry',
  'Biology',
  'English Language',
  'Government',
  'Literature in English',
  'Christian Religious Studies',
  'Islamic Religious Studies',
  'Commerce',
  'Economics',
]

const WEEKS = Array.from({ length: 26 }, (_, i) => `Week ${i + 1}`)

const SUBSCRIPTION_PRICE_NGN = 800

const RANK_TIERS = [
  { name: 'GHOST',   min: 0,  color: 'gray' },
  { name: 'ROOKIE',  min: 1,  color: 'gray' },
  { name: 'LEARNER', min: 6,  color: 'yellow' },
  { name: 'CADET',   min: 11, color: 'blue' },
  { name: 'SCHOLAR', min: 16, color: 'purple' },
  { name: 'ELITE',   min: 21, color: 'green' },
]

// TEMP: Testing period — card thresholds lowered (1 miss = yellow). Revert to 2,4,6 after test.
const CARD_YELLOW_1 = 1
const CARD_YELLOW_2 = 2
const CARD_RED = 3

export { SUBJECTS, WEEKS, SUBSCRIPTION_PRICE_NGN, RANK_TIERS, CARD_YELLOW_1, CARD_YELLOW_2, CARD_RED }
