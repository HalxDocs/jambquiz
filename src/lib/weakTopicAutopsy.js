export const SUBTOPIC_RULES = {
  Mathematics: [
    { id: 'algebra_equations', label: 'Equations & Inequalities',
      keywords: ['equation', 'solve', 'inequality', 'quadratic', 'linear', 'simultaneous', 'unknown', 'variable', 'root', 'factor'],
      keySentence: 'Quadratic equations are solved by factorization, completing the square, or the formula x = (-b ± √(b²-4ac)) / 2a.',
      action: 'Solve 3 quadratics today: one by factor, one by formula, one by completing the square.' },
    { id: 'algebra_sequences', label: 'Sequences & Series',
      keywords: ['sequence', 'series', 'ap', 'gp', 'arithmetic', 'geometric', 'progression', 'sum', 'nth term', 'common difference', 'common ratio'],
      keySentence: 'In an AP the nth term is a + (n-1)d and sum of n terms is n/2(2a + (n-1)d). In a GP: ar^(n-1) and sum is a(1-r^n)/(1-r).',
      action: 'Find the 10th term and the sum of the first 10 terms of the AP: 3, 7, 11, 15, ...' },
    { id: 'trigonometry', label: 'Trigonometry',
      keywords: ['sin', 'cos', 'tan', 'sine', 'cosine', 'tangent', 'angle', 'radian', 'degree', 'triangle', 'trigonometric', 'θ', 'theta', 'identity', 'wave'],
      keySentence: 'sin²θ + cos²θ = 1. For any triangle: a/sinA = b/sinB = c/sinC. Memorize sin, cos, tan of 0°, 30°, 45°, 60°, 90°.',
      action: 'Without a calculator, write the exact values of sin 30°, cos 60°, tan 45°, and prove sin²30° + cos²30° = 1.' },
    { id: 'calculus', label: 'Calculus (Differentiation & Integration)',
      keywords: ['differentiate', 'integrate', 'derivative', 'integral', 'limit', 'dy/dx', '∫', 'rate of change', 'max', 'min', 'gradient', 'function'],
      keySentence: 'd/dx (x^n) = nx^(n-1). d/dx (sin x) = cos x. ∫x^n dx = x^(n+1)/(n+1) + C. Always add +C to an integral.',
      action: 'Differentiate y = 3x⁴ - 2x² + 5x - 7. Then integrate your answer to get back to the original (plus C).' },
    { id: 'geometry', label: 'Geometry & Mensuration',
      keywords: ['area', 'perimeter', 'volume', 'circle', 'triangle', 'rectangle', 'sphere', 'cone', 'cylinder', 'angle', 'polygon', 'chord', 'radius', 'diameter', 'π', 'pi'],
      keySentence: 'Circle area = πr², circumference = 2πr. Volume of cylinder = πr²h. For triangles: area = ½ × base × height.',
      action: 'Find the area and circumference of a circle with radius 7cm. Then find the volume of a cylinder with that radius and height 10cm.' },
    { id: 'statistics_prob', label: 'Statistics & Probability',
      keywords: ['mean', 'median', 'mode', 'probability', 'distribution', 'frequency', 'histogram', 'standard deviation', 'variance', 'sample', 'chance', 'odds', 'normal'],
      keySentence: 'Mean = sum/count. Probability of A or B = P(A) + P(B) - P(A∩B). For independent events: P(A∩B) = P(A) × P(B).',
      action: 'A bag has 5 red and 3 blue balls. Find P(red then blue) without replacement.' },
    { id: 'vectors_matrices', label: 'Vectors & Matrices',
      keywords: ['vector', 'matrix', 'determinant', 'inverse', 'dot product', 'cross product', 'magnitude', 'direction', 'column', 'row', 'transpose', 'eigenvalue'],
      keySentence: 'Vector magnitude = √(x² + y² + z²). 2×2 determinant = ad - bc. Matrix inverse exists only when det ≠ 0.',
      action: 'Find the magnitude of vector (3, 4, 12) and the determinant of [[2,3],[1,4]].' },
    { id: 'number_theory', label: 'Number Theory & Indices',
      keywords: ['logarithm', 'log', 'index', 'indices', 'exponent', 'power', 'modulo', 'remainder', 'hcf', 'lcm', 'prime', 'factor', 'surd', 'standard form'],
      keySentence: 'log_a(xy) = log_a(x) + log_a(y). log_a(x/y) = log_a(x) - log_a(y). HCF × LCM = a × b for two numbers.',
      action: 'Simplify log₁₀(1000) + log₁₀(0.01) without a calculator. Find HCF and LCM of 24 and 36.' },
  ],
  Physics: [
    { id: 'mechanics', label: 'Mechanics (Forces & Motion)',
      keywords: ['force', 'newton', 'acceleration', 'velocity', 'momentum', 'kinetic', 'potential', 'energy', 'work', 'power', 'friction', 'gravity', 'mass', 'weight'],
      keySentence: 'F = ma. KE = ½mv². PE = mgh. Momentum = mv. Power = Work/time. Weight = mg where g = 10 m/s².',
      action: 'A 2kg ball is thrown up at 20 m/s. Find its max height and the time to reach it.' },
    { id: 'waves_optics', label: 'Waves & Optics',
      keywords: ['wave', 'frequency', 'wavelength', 'amplitude', 'period', 'reflection', 'refraction', 'lens', 'mirror', 'snell', 'angle', 'hertz', 'speed of light'],
      keySentence: 'v = fλ. Snell\'s law: n₁ sin θ₁ = n₂ sin θ₂. Real image: object beyond focal length of a converging lens.',
      action: 'A wave has frequency 50 Hz and wavelength 4 m. Find its speed. Then draw the ray diagram for an object placed 2F in front of a converging lens.' },
    { id: 'electricity', label: 'Electricity & Circuits',
      keywords: ['current', 'voltage', 'resistance', 'ohm', 'circuit', 'capacitor', 'battery', 'ampere', 'series', 'parallel', 'resistor', 'power', 'watt', 'kirchhoff'],
      keySentence: 'V = IR. Power P = IV = I²R. Series: R_total = R₁ + R₂. Parallel: 1/R_total = 1/R₁ + 1/R₂.',
      action: 'Two 6Ω resistors are in parallel across a 12V battery. Find the total current drawn.' },
    { id: 'magnetism', label: 'Magnetism & Electromagnetism',
      keywords: ['magnetic', 'field', 'flux', 'faraday', 'lenz', 'inductor', 'solenoid', 'north', 'south', 'pole', 'emf', 'induced', 'transformer'],
      keySentence: 'Faraday\'s law: emf = -N dΦ/dt. Lenz\'s law: induced current opposes the change. A transformer steps voltage up or down: V₁/V₂ = N₁/N₂.',
      action: 'A coil of 200 turns has flux changing at 0.05 Wb/s. Find the induced emf.' },
    { id: 'heat_thermo', label: 'Heat & Thermodynamics',
      keywords: ['heat', 'temperature', 'specific heat', 'latent', 'conduction', 'convection', 'radiation', 'celsius', 'kelvin', 'gas', 'pressure', 'volume', 'boyle', 'charles'],
      keySentence: 'Q = mcΔθ. Q = mL (latent heat). Boyle\'s law: PV = constant (at constant T). Charles\'s law: V/T = constant.',
      action: 'How much heat is needed to raise 2kg of water from 20°C to 100°C? (c = 4200 J/kg°C)' },
    { id: 'modern_physics', label: 'Modern Physics',
      keywords: ['photoelectric', 'quantum', 'bohr', 'atom', 'radioactive', 'half-life', 'nuclear', 'isotope', 'photon', 'planck', 'einstein', 'relativity'],
      keySentence: 'E = hf. E = mc². Half-life: after n half-lives, fraction remaining = (½)ⁿ.',
      action: 'A sample has a half-life of 3 days. How much is left after 9 days if you started with 80g?' },
    { id: 'projectiles', label: 'Projectile Motion',
      keywords: ['projectile', 'range', 'trajectory', 'launch', 'horizontal', 'vertical', 'angle of projection', 'maximum height', 'time of flight'],
      keySentence: 'Time of flight T = 2usinθ/g. Range R = u²sin2θ/g. Max height H = u²sin²θ/2g.',
      action: 'A ball is launched at 30 m/s at 45°. Find its range and maximum height.' },
  ],
  Chemistry: [
    { id: 'organic_naming', label: 'Organic Chemistry (Naming)',
      keywords: ['alkane', 'alkene', 'alkyne', 'alcohol', 'ester', 'carboxylic', 'ketone', 'aldehyde', 'amine', 'amide', 'benzene', 'methyl', 'ethyl', 'propyl', 'homologous'],
      keySentence: 'Alkanes end in -ane (single bonds). Alkenes end in -ene (one C=C). Alkynes end in -yne (one C≡C). Alcohols end in -ol. Acids end in -oic.',
      action: 'Name CH₃-CH₂-CH=CH₂. Then draw hex-1-ene and label the C=C.' },
    { id: 'acids_bases', label: 'Acids, Bases & Salts',
      keywords: ['acid', 'base', 'salt', 'ph', 'neutralization', 'titration', 'indicator', 'buffer', 'alkali', 'hydrogen', 'hydroxide', 'litmus'],
      keySentence: 'Acids produce H⁺ in water. Bases produce OH⁻. Neutralization: acid + base → salt + water. pH 7 = neutral; below = acidic, above = alkaline.',
      action: 'Write the balanced equation for HCl + NaOH. Then for H₂SO₄ + KOH.' },
    { id: 'periodic_table', label: 'Periodic Table & Trends',
      keywords: ['periodic', 'group', 'period', 'element', 'atomic number', 'mass', 'electronegativity', 'ionization', 'metallic', 'transition', 'halogen', 'noble gas', 'alkali'],
      keySentence: 'Atomic radius decreases across a period and increases down a group. Electronegativity increases across a period and decreases down a group.',
      action: 'Explain why sodium is more reactive than lithium, even though both are in Group 1.' },
    { id: 'bonding', label: 'Chemical Bonding',
      keywords: ['ionic', 'covalent', 'metallic', 'bond', 'dative', 'coordinate', 'polar', 'nonpolar', 'electronegativity', 'lattice', 'giant', 'molecule'],
      keySentence: 'Ionic = metal + non-metal, transfers electrons. Covalent = non-metal + non-metal, shares electrons. Metallic = metal lattice in a sea of electrons.',
      action: 'State the type of bonding in NaCl, H₂O, and Cu. Explain why using electronegativity differences.' },
    { id: 'stoichiometry', label: 'Stoichiometry & Mole Concept',
      keywords: ['mole', 'molar', 'avogadro', 'mass', 'moles', 'limiting', 'reactant', 'yield', 'empirical', 'molecular formula', 'concentration', 'molarity'],
      keySentence: 'moles = mass / molar mass. 1 mole = 6.02 × 10²³ particles. For solutions: moles = concentration × volume (in dm³).',
      action: 'Find the number of moles in 88g of CO₂. (C=12, O=16)' },
    { id: 'electrochemistry', label: 'Electrochemistry',
      keywords: ['electrolysis', 'electrolyte', 'anode', 'cathode', 'electrochemical', 'galvanic', 'cell', 'redox', 'oxidation', 'reduction', 'electrode', 'volt'],
      keySentence: 'Oxidation = loss of electrons (anode). Reduction = gain of electrons (cathode). OIL RIG. In electrolysis, cations move to cathode, anions to anode.',
      action: 'Identify what is oxidized and what is reduced in Zn + Cu²⁺ → Zn²⁺ + Cu.' },
    { id: 'rates_equilibrium', label: 'Rates of Reaction & Equilibrium',
      keywords: ['rate', 'equilibrium', 'le chatelier', 'reversible', 'activation energy', 'catalyst', 'concentration', 'temperature', 'pressure', 'shift'],
      keySentence: 'Le Chatelier: if you change concentration, temperature, or pressure, the equilibrium shifts to oppose the change. A catalyst lowers activation energy but does not shift equilibrium.',
      action: 'For N₂ + 3H₂ ⇌ 2NH₃ (exothermic), what happens to yield if you (a) increase temperature, (b) increase pressure?' },
    { id: 'hydrocarbons_fuels', label: 'Hydrocarbons & Fuels',
      keywords: ['petroleum', 'cracking', 'fractional distillation', 'natural gas', 'crude oil', 'combustion', 'fossil fuel', 'biomass', 'methane', 'ethanol'],
      keySentence: 'Cracking breaks long-chain alkanes into shorter, more useful ones. Combustion of hydrocarbons: hydrocarbon + O₂ → CO₂ + H₂O.',
      action: 'Write the balanced equation for the complete combustion of propane (C₃H₈).' },
  ],
  Biology: [
    { id: 'cell_biology', label: 'Cell Biology',
      keywords: ['cell', 'membrane', 'nucleus', 'mitochondria', 'ribosome', 'chloroplast', 'cytoplasm', 'organelle', 'eukaryotic', 'prokaryotic', 'osmosis', 'diffusion'],
      keySentence: 'Mitochondria = powerhouse (ATP). Chloroplast = photosynthesis. Ribosome = protein synthesis. Nucleus = DNA. Osmosis: water moves from high to low water potential.',
      action: 'Draw an animal cell and label 6 organelles with their functions.' },
    { id: 'genetics', label: 'Genetics & Heredity',
      keywords: ['gene', 'allele', 'dominant', 'recessive', 'genotype', 'phenotype', 'homozygous', 'heterozygous', 'punnett', 'mendel', 'chromosome', 'dna', 'rna', 'meiosis'],
      keySentence: 'Dominant allele is expressed in the phenotype even with one copy (Aa). Recessive only expressed when homozygous (aa). Mendelian ratios: monohybrid 3:1, dihybrid 9:3:3:1.',
      action: 'Cross Aa × Aa. What fraction of offspring will show the dominant phenotype?' },
    { id: 'ecology', label: 'Ecology & Environment',
      keywords: ['ecosystem', 'food chain', 'food web', 'biome', 'population', 'community', 'habitat', 'niche', 'predator', 'prey', 'biodiversity', 'conservation', 'climate'],
      keySentence: 'Energy flows up the food chain, biomass decreases. Producers → primary consumers → secondary → tertiary. Only ~10% energy transfers between trophic levels.',
      action: 'In a food chain grass → grasshopper → frog → snake, if grass has 10,000 units of energy, how much reaches the snake?' },
    { id: 'human_physiology', label: 'Human Physiology',
      keywords: ['heart', 'blood', 'lung', 'kidney', 'liver', 'digestive', 'respiratory', 'nervous', 'brain', 'neuron', 'synapse', 'hormone', 'enzyme'],
      keySentence: 'Oxygenated blood: left side of heart, arteries. Deoxygenated: right side, veins. (Note: pulmonary artery carries deoxygenated blood.)',
      action: 'Trace one drop of blood from the right atrium through the heart and out to the body. Name every chamber and vessel.' },
    { id: 'reproduction', label: 'Reproduction',
      keywords: ['reproduction', 'sexual', 'asexual', 'ovary', 'testis', 'ovum', 'sperm', 'fertilization', 'menstrual', 'pregnancy', 'embryo', 'fetus', 'gestation'],
      keySentence: 'Asexual = one parent, no gametes, offspring are clones. Sexual = two parents, gametes fuse, offspring are genetically unique. Fertilization = sperm + egg → zygote.',
      action: 'Compare sexual and asexual reproduction. Give 2 advantages of each.' },
    { id: 'nutrition', label: 'Nutrition & Digestion',
      keywords: ['nutrition', 'carbohydrate', 'protein', 'lipid', 'vitamin', 'mineral', 'enzyme', 'digestion', 'absorption', 'glucose', 'amino acid', 'fatty acid'],
      keySentence: 'Carbs → glucose. Proteins → amino acids. Lipids → fatty acids + glycerol. Vitamins A, C, D, E, K, B-complex. Excess water-soluble vitamins are excreted.',
      action: 'Name 2 sources each of carbohydrates, proteins, lipids. Which vitamin deficiency causes scurvy?' },
    { id: 'evolution', label: 'Evolution & Variation',
      keywords: ['evolution', 'natural selection', 'mutation', 'variation', 'adaptation', 'speciation', 'darwin', 'lamarck', 'fossil', 'common ancestor', 'selective pressure'],
      keySentence: 'Natural selection: variation → competition → survival of the fittest → reproduction → passing on of favorable traits.',
      action: 'Explain how peppered moths in industrial England are a classic example of natural selection.' },
  ],
  'English Language': [
    { id: 'grammar_tenses', label: 'Tenses & Verb Forms',
      keywords: ['tense', 'past', 'present', 'future', 'verb', 'aspect', 'continuous', 'perfect', 'simple', 'conjugation', 'subject-verb'],
      keySentence: '12 tenses in English. Present perfect = past action with present relevance ("I have eaten"). Past continuous = ongoing past action ("I was eating").',
      action: 'Convert these 5 sentences to the opposite tense: present simple, past simple, present perfect, past continuous.' },
    { id: 'vocabulary', label: 'Vocabulary & Antonyms/Synonyms',
      keywords: ['synonym', 'antonym', 'meaning', 'opposite', 'word', 'lexis', 'vocabulary', 'register', 'denotation', 'connotation'],
      keySentence: 'Context always wins. If you don\'t know a word, read the surrounding sentences. Connotation (feeling) often differs from denotation (dictionary meaning).',
      action: 'Pick 5 words from today\'s reading. Write a synonym, an antonym, and use each in a new sentence.' },
    { id: 'comprehension', label: 'Reading Comprehension',
      keywords: ['passage', 'comprehension', 'main idea', 'imply', 'infer', 'tone', 'attitude', 'summary', 'theme', 'context', 'according to'],
      keySentence: 'Read the question first. Then scan the passage for keywords from the question. The answer is usually paraphrased — not copied — from the passage.',
      action: 'Read any 1-page article. Write the main idea in one sentence and 3 supporting details.' },
    { id: 'oral_english', label: 'Oral English (Vowels, Stress, Intonation)',
      keywords: ['vowel', 'consonant', 'syllable', 'stress', 'intonation', 'rhythm', 'pronunciation', 'diphthong', 'monophthong', 'accent'],
      keySentence: 'Monophthongs = single, pure vowel sounds. Diphthongs = two vowel sounds gliding together. Stress falls on the strong syllable — say the word aloud to find it.',
      action: 'Mark the stressed syllable in: photograph, photographIC, demoGRAPHy. Practice saying them aloud.' },
    { id: 'register_style', label: 'Register & Style',
      keywords: ['formal', 'informal', 'register', 'style', 'essay', 'letter', 'speech', 'article', 'tone', 'audience', 'purpose'],
      keySentence: 'Formal = no contractions, full words, third person. Informal = contractions OK, slang, first/second person. Match register to purpose and audience.',
      action: 'Take any sentence you wrote today. Rewrite it in formal English and again in informal English.' },
  ],
  Government: [
    { id: 'constitution', label: 'Constitution & Constitutionalism',
      keywords: ['constitution', 'federal', 'unitary', 'confederation', 'sovereignty', 'rule of law', 'separation of powers', 'checks and balances', 'amendment', 'bill of rights'],
      keySentence: 'Federalism divides power between central and state governments. Rule of law: everyone is subject to the law, including the government itself.',
      action: 'List 3 features of the 1999 Nigerian Constitution and explain what each means in practice.' },
    { id: 'political_ideology', label: 'Political Ideologies',
      keywords: ['democracy', 'capitalism', 'socialism', 'communism', 'fascism', 'anarchism', 'ideology', 'liberalism', 'conservatism', 'nationalism', 'imperialism'],
      keySentence: 'Democracy = government by the people, through elected representatives. Socialism = state owns means of production. Capitalism = private ownership of means of production.',
      action: 'Compare democracy and socialism. Where do they overlap, and where do they conflict?' },
    { id: 'nigeria_political', label: 'Nigerian Political History',
      keywords: ['nigeria', 'lugard', 'amalgamation', 'independence', 'balewa', 'first republic', 'second republic', 'military', 'biafra', 'civil war', 'yaba', 'oau', 'nigerian civil war'],
      keySentence: '1914: Northern and Southern Nigeria amalgamated by Lord Lugard. 1960: Independence. 1967-70: Civil war (Biafra). 1999: Return to democracy under Obasanjo.',
      action: 'Write a 5-sentence timeline: 1914, 1960, 1966, 1967, 1999. What happened at each date?' },
    { id: 'international_orgs', label: 'International Organizations',
      keywords: ['un', 'united nations', 'au', 'african union', 'ecowas', 'commonwealth', 'nato', 'world bank', 'imf', 'security council', 'general assembly', 'veto'],
      keySentence: 'UN Security Council has 5 permanent members with veto power: USA, UK, France, Russia, China. ECOWAS promotes regional integration in West Africa.',
      action: 'Name the 5 permanent UN Security Council members. Which one has not used the veto since 1990?' },
  ],
  'Literature in English': [
    { id: 'prose_analysis', label: 'Prose Analysis',
      keywords: ['novel', 'prose', 'narrative', 'protagonist', 'antagonist', 'plot', 'theme', 'setting', 'point of view', 'characterization', 'conflict'],
      keySentence: 'Theme is the central idea, not the plot. Protagonist = main character. Antagonist = force opposing the protagonist. Show, don\'t tell — narrative shows through action and dialogue.',
      action: 'Pick any prose excerpt. Identify the protagonist, the conflict, and the implied theme in 2-3 sentences.' },
    { id: 'poetry_analysis', label: 'Poetry Analysis',
      keywords: ['poem', 'poetry', 'stanza', 'verse', 'rhyme', 'rhythm', 'meter', 'imagery', 'metaphor', 'simile', 'symbol', 'alliteration', 'personification', 'diction'],
      keySentence: 'Imagery appeals to the senses. Metaphor = direct comparison. Simile = comparison using "like" or "as." Read the poem aloud — rhythm and sound matter.',
      action: 'Pick any 8-line poem. Identify 3 poetic devices and explain what each adds to the meaning.' },
    { id: 'drama_analysis', label: 'Drama Analysis',
      keywords: ['drama', 'play', 'act', 'scene', 'tragedy', 'comedy', 'soliloquy', 'aside', 'monologue', 'dialogue', 'stage direction', 'dramatic irony'],
      keySentence: 'Tragedy ends in death or downfall of the protagonist. Comedy ends in marriage or reconciliation. Soliloquy = character alone on stage, speaking thoughts aloud.',
      action: 'Explain the difference between dramatic irony and situational irony, with one example each.' },
    { id: 'african_lit', label: 'African Literature',
      keywords: ['achebe', 'soyinka', 'ngugi', 'things fall apart', 'lion and the jewel', 'december', 'african', 'oral tradition', 'postcolonial', 'negritude', 'wole', 'gambari'],
      keySentence: 'Achebe\'s "Things Fall Apart" is the foundational modern African novel. Soyinka was the first African Nobel Literature laureate (1986). Oral tradition is central to African literature.',
      action: 'List 3 themes from "Things Fall Apart" and connect each to a specific event in the novel.' },
  ],
  'Christian Religious Studies': [
    { id: 'old_testament', label: 'Old Testament',
      keywords: ['genesis', 'exodus', 'moses', 'abraham', 'isaac', 'jacob', 'joseph', 'david', 'solomon', 'prophet', 'covenant', 'israel', 'egypt', 'ten commandments'],
      keySentence: 'God\'s covenant with Abraham: land, descendants, blessing. Ten Commandments = the foundation of Mosaic Law. The prophets called Israel back to faithfulness.',
      action: 'List the 10 Commandments. Then explain how the first 4 relate to our relationship with God and the last 6 to our relationship with others.' },
    { id: 'new_testament', label: 'New Testament',
      keywords: ['jesus', 'gospel', 'matthew', 'mark', 'luke', 'john', 'paul', 'apostle', 'resurrection', 'salvation', 'grace', 'faith', 'baptism', 'communion'],
      keySentence: 'Four Gospels = Matthew, Mark, Luke, John. Salvation by grace through faith (Ephesians 2:8). Paul wrote many epistles to early churches.',
      action: 'List the 4 Gospels and one unique feature of each. Why are there 4 instead of 1?' },
    { id: 'church_history', label: 'Church History',
      keywords: ['church', 'reformation', 'luther', 'calvin', 'catholic', 'protestant', 'worship', 'creed', 'council', 'schism', 'missionary', 'crusades'],
      keySentence: '1517: Martin Luther\'s 95 Theses — the Reformation began. Result: division between Catholic and Protestant Christianity.',
      action: 'Name 3 differences between Catholic and Protestant Christianity. Why did the Reformation happen?' },
  ],
  'Islamic Religious Studies': [
    { id: 'pillars_of_islam', label: 'Five Pillars of Islam',
      keywords: ['shahada', 'salah', 'zakat', 'sawm', 'hajj', 'pilgrimage', 'prayer', 'fasting', 'charity', 'declaration of faith', 'mecca', 'kaaba'],
      keySentence: 'Five Pillars: Shahada (declaration of faith), Salah (5 daily prayers), Zakat (charity, 2.5%), Sawm (fasting during Ramadan), Hajj (pilgrimage to Mecca once in lifetime if able).',
      action: 'Explain the difference between Zakat and Sadaqah. When is Hajj obligatory?' },
    { id: 'quran_hadith', label: 'Quran & Hadith',
      keywords: ['quran', 'hadith', 'sunnah', 'revelation', 'muhammad', 'prophet', 'surah', 'ayah', 'verse', 'wahy', 'jibril', 'angel'],
      keySentence: 'Quran = the literal word of Allah revealed to Prophet Muhammad through Angel Jibril (Gabriel). Hadith = sayings, actions, and approvals of the Prophet. Sunnah = the Prophet\'s practice.',
      action: 'What is the difference between Quran and Hadith? Give 2 examples of each type of Hadith (sahih, hasan, da\'if).' },
    { id: 'islamic_law', label: 'Islamic Law (Sharia)',
      keywords: ['sharia', 'halal', 'haram', 'fiqh', 'fatwa', 'mufti', 'imam', 'qadi', 'sunni', 'shia', 'school of thought', 'maliki', 'hanafi', 'shafii', 'hanbali'],
      keySentence: 'Sharia = Islamic law derived from Quran and Hadith. The 4 Sunni schools of thought: Hanafi, Maliki, Shafi\'i, Hanbali. Each is considered valid by Sunnis.',
      action: 'Explain the difference between Sunni and Shia Islam. Why did the split happen?' },
  ],
  Commerce: [
    { id: 'trade_commerce', label: 'Trade & Commerce',
      keywords: ['trade', 'commerce', 'wholesale', 'retail', 'import', 'export', 'home trade', 'foreign trade', 'barter', 'money', 'exchange', 'middleman'],
      keySentence: 'Home trade = within one country. Foreign/international trade = between countries. Retailer = sells to final consumer. Wholesaler = sells in bulk to retailers.',
      action: 'Trace a product from the manufacturer to the final consumer. Name every middleman in between.' },
    { id: 'business_ownership', label: 'Forms of Business Ownership',
      keywords: ['sole proprietorship', 'partnership', 'limited liability', 'cooperative', 'public corporation', 'private', 'joint stock', 'shares', 'dividend', 'board of directors'],
      keySentence: 'Sole proprietorship: 1 owner, unlimited liability. Partnership: 2-20 owners, shared liability. Limited liability company: owners\' liability = their investment only.',
      action: 'Compare sole proprietorship and a public limited company. Which is easier to set up? Which is easier to raise capital for?' },
    { id: 'finance_banking', label: 'Finance & Banking',
      keywords: ['bank', 'savings', 'current account', 'fixed deposit', 'interest', 'loan', 'overdraft', 'cheque', 'atm', 'commercial bank', 'central bank', 'apex', 'cbn'],
      keySentence: 'Commercial banks accept deposits and give loans. Central bank (CBN in Nigeria) controls monetary policy. Interest on savings: simple or compound.',
      action: 'Find the difference between a current account and a savings account. Which one pays interest?' },
  ],
  Economics: [
    { id: 'demand_supply', label: 'Demand & Supply',
      keywords: ['demand', 'supply', 'price', 'equilibrium', 'elastic', 'inelastic', 'shortage', 'surplus', 'market', 'quantity', 'shift', 'movement'],
      keySentence: 'Law of demand: as price rises, quantity demanded falls. Law of supply: as price rises, quantity supplied rises. Equilibrium: where demand meets supply.',
      action: 'If the price of rice increases by 20% and quantity demanded falls by 5%, is the demand elastic or inelastic?' },
    { id: 'national_income', label: 'National Income',
      keywords: ['gdp', 'gnp', 'national income', 'per capita', 'inflation', 'deflation', 'unemployment', 'fiscal', 'monetary', 'recession', 'growth', 'standard of living'],
      keySentence: 'GDP = total value of goods and services produced in a country in a year. GNP = GDP + income from abroad - income sent abroad. Per capita = total / population.',
      action: 'Explain 3 causes of inflation in Nigeria. How does the government try to control it?' },
    { id: 'market_structures', label: 'Market Structures',
      keywords: ['perfect competition', 'monopoly', 'oligopoly', 'monopolistic', 'cartel', 'barriers to entry', 'profit maximization', 'price taker', 'price maker', 'duopoly'],
      keySentence: 'Perfect competition: many buyers, many sellers, identical products. Monopoly: one seller, high barriers to entry, price maker. Oligopoly: few large firms.',
      action: 'Is the Nigerian telecommunications market an oligopoly or monopolistic competition? Justify with 3 features.' },
  ],
}

export const EXPECTED_POINTS = {
  default: { min: 4, max: 10, label: '+4 to +10 in next quiz' },
  high_yield: { min: 8, max: 16, label: '+8 to +16 in next quiz' },
  quick_win: { min: 4, max: 8, label: '+4 to +8 in next quiz' },
}

export const HIGH_YIELD_SUBTOPICS = new Set([
  'organic_naming',
  'acids_bases',
  'stoichiometry',
  'algebra_equations',
  'trigonometry',
  'mechanics',
  'electricity',
  'cell_biology',
  'genetics',
  'comprehension',
  'grammar_tenses',
])

const STOPWORDS = new Set([
  'a','an','and','or','but','the','is','are','was','were','be','been','being','have','has','had','do','does','did',
  'will','would','shall','should','may','might','can','could','must','of','in','on','at','to','for','with','by','from',
  'as','into','through','during','before','after','above','below','between','out','off','over','under','again','further',
  'then','once','here','there','when','where','why','how','all','any','both','each','few','more','most','other','some',
  'such','no','nor','not','only','own','same','so','than','too','very','s','t','just','don','now','it','its','this',
  'that','these','those','i','me','my','we','our','you','your','he','him','his','she','her','they','them','their','what',
  'which','who','whom','whose','if','because','while','about','against','also','between','because','through','up',
])

function tokenize(s) {
  if (!s) return []
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w))
}

function keywordOverlap(haystackTokens, keywords) {
  const haystack = new Set(haystackTokens)
  let hits = 0
  const matched = []
  for (const kw of keywords) {
    const lw = kw.toLowerCase()
    if (lw.includes(' ') || lw.includes('-')) {
      if (haystackTokens.some((t) => t.includes(lw.split(/[\s-]/)[0]) && lw.length > 4)) {
        hits += 1
        matched.push(kw)
      }
    } else if (haystack.has(lw) || haystackTokens.some((t) => t.startsWith(lw) && lw.length >= 5)) {
      hits += 1
      matched.push(kw)
    }
  }
  return { hits, matched }
}

function classifyQuestionToSubtopic(subject, question, explanation) {
  const rules = SUBTOPIC_RULES[subject] || []
  if (rules.length === 0) return null
  const haystack = [...tokenize(question), ...tokenize(explanation)]
  let best = null
  for (const r of rules) {
    const { hits, matched } = keywordOverlap(haystack, r.keywords)
    if (hits > 0 && (!best || hits > best.hits)) {
      best = { id: r.id, label: r.label, hits, matched, keySentence: r.keySentence, action: r.action }
    }
  }
  return best
}

function buildPerSubjectMisses(currentResults, historyResults) {
  const bySubject = {}
  const allResults = [...(historyResults || []), ...(currentResults || [])]
  allResults.forEach((r) => {
    if (!r || !r.subject) return
    if (!bySubject[r.subject]) bySubject[r.subject] = { subject: r.subject, attempts: 0, totalScore: 0, totalOutOf: 0, missed: [], recent: r }
    const bucket = bySubject[r.subject]
    bucket.attempts += 1
    bucket.totalScore += r.score || 0
    bucket.totalOutOf += r.outOf || 100
    if (Array.isArray(r.questions) && Array.isArray(r.answers)) {
      r.questions.forEach((q, i) => {
        if (r.answers[i] !== q.answer) {
          bucket.missed.push({
            question: q.question,
            explanation: q.explanation || '',
            correctAnswer: q.options?.[q.answer] ?? '',
            studentAnswer: r.answers[i] !== null ? (q.options?.[r.answers[i]] ?? '') : '(skipped)',
          })
        }
      })
    }
  })
  return bySubject
}

function summarizeSubject(bucket) {
  const avgPct = bucket.attempts > 0 ? Math.round((bucket.totalScore / bucket.totalOutOf) * 100) : 0
  const pointsLost = Math.max(0, Math.round((70 - avgPct) * (bucket.attempts || 1) * 0.4))
  return {
    subject: bucket.subject,
    avgPct,
    attempts: bucket.attempts,
    pointsLost,
    missedCount: bucket.missed.length,
    missed: bucket.missed,
    recent: bucket.recent,
  }
}

function findBiggestBleeding(missed, subject) {
  if (!missed || missed.length === 0) return null
  const buckets = {}
  for (const m of missed) {
    const cls = classifyQuestionToSubtopic(subject, m.question, m.explanation)
    const key = cls ? cls.id : '__unmatched__'
    if (!buckets[key]) {
      buckets[key] = {
        key,
        label: cls ? cls.label : 'General review needed',
        keySentence: cls ? cls.keySentence : 'Revisit your core notes for this subject and redo missed questions.',
        action: cls ? cls.action : 'Find the most-missed questions in this subject and write out the correct answers + explanations in your own words.',
        count: 0,
        sampleQuestions: [],
        matchedKeywords: new Set(),
      }
    }
    buckets[key].count += 1
    if (buckets[key].sampleQuestions.length < 3) {
      buckets[key].sampleQuestions.push(m.question)
    }
  }
  const ranked = Object.values(buckets).sort((a, b) => b.count - a.count)
  return ranked[0] || null
}

function expectedRangeFor(subtopicId) {
  if (HIGH_YIELD_SUBTOPICS.has(subtopicId)) return EXPECTED_POINTS.high_yield
  return EXPECTED_POINTS.default
}

function buildTonightAction(subjectSummary) {
  const bleeding = subjectSummary.biggestBleeding
  if (!bleeding || bleeding.key === '__unmatched__') {
    return {
      oneAction: `Spend 20 minutes reviewing ${subjectSummary.subject} fundamentals.`,
      keySentence: 'Start with the chapter summary, then redo the 3 questions you missed today.',
      practicePrompt: `Open your ${subjectSummary.subject} notes and list the 3 topics you found hardest today. Write 3 sentences on each.`,
      expectedPoints: EXPECTED_POINTS.quick_win.label,
    }
  }
  const range = expectedRangeFor(bleeding.key)
  return {
    oneAction: `Spend 20 minutes on ${bleeding.label} in ${subjectSummary.subject}.`,
    keySentence: bleeding.keySentence,
    practicePrompt: bleeding.action,
    expectedPoints: range.label,
  }
}

function buildParentLine(summaries, tonight) {
  if (summaries.length === 0) return ''
  const worst = summaries[0]
  if (!tonight || !tonight.oneAction) return ''
  return `You lost ~${worst.pointsLost} JAMB points this month in ${summaries.length} subject${summaries.length > 1 ? 's' : ''}. ${tonight.oneAction} — you should gain ${tonight.expectedPoints}.`
}

export function runAutopsy({ currentResults = [], historyResults = [] } = {}) {
  const buckets = buildPerSubjectMisses(currentResults, historyResults)
  let summaries = Object.values(buckets)
    .map(summarizeSubject)
    .filter((s) => s.avgPct < 70)
    .map((s) => {
      const bleeding = findBiggestBleeding(s.missed, s.subject)
      return { ...s, biggestBleeding: bleeding }
    })
    .sort((a, b) => b.pointsLost - a.pointsLost)

  if (summaries.length === 0) {
    const allSubs = Object.values(buckets).map(summarizeSubject).sort((a, b) => a.avgPct - b.avgPct)
    if (allSubs.length === 0) {
      return { worstSubjects: [], tonight: null, parentLine: 'No quiz data yet — take your first quiz to unlock a diagnosis.', hasData: false }
    }
    const fallback = allSubs[0]
    fallback.biggestBleeding = findBiggestBleeding(fallback.missed, fallback.subject)
    summaries = [fallback]
  }

  const worst = summaries[0]
  const tonight = buildTonightAction(worst)
  const parentLine = buildParentLine(summaries, tonight)

  return {
    worstSubjects: summaries,
    tonight,
    parentLine,
    hasData: true,
  }
}

export function runAutopsyFromCurrentQuiz(currentResults) {
  return runAutopsy({ currentResults, historyResults: [] })
}

export function runAutopsyWithHistory(currentResults, historyResults) {
  return runAutopsy({ currentResults, historyResults })
}

