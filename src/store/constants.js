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
const TRIAL_DAYS = 14

const RANK_TIERS = [
  { name: 'GHOST',   min: 0,  color: 'gray' },
  { name: 'ROOKIE',  min: 1,  color: 'gray' },
  { name: 'LEARNER', min: 6,  color: 'yellow' },
  { name: 'CADET',   min: 11, color: 'blue' },
  { name: 'SCHOLAR', min: 16, color: 'purple' },
  { name: 'ELITE',   min: 21, color: 'green' },
]

export { SUBJECTS, WEEKS, SUBSCRIPTION_PRICE_NGN, TRIAL_DAYS, RANK_TIERS }
