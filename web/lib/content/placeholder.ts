import type {
  AyahRow,
  AudioFileRow,
  ContentSummary,
  ReciterRow,
  SegmentRow,
  SurahRow,
  WordRow,
} from './types'

/**
 * PLACEHOLDER CONTENT — stands in until a content bundle (or the local
 * fixture) is available for a surah. Surah metadata is real enough to browse.
 * Curated verses carry the Tanzil Uthmani text and a placeholder
 * transliteration; every other verse is generated and clearly marked. No
 * translation is bundled: the captain dropped English translations on
 * 2026-09-25.
 */

type SurahSeed = [number, string, string, string, number, 'Meccan' | 'Medinan']

const SURAH_SEEDS: SurahSeed[] = [
  [1, 'الفاتحة', 'Al-Fatihah', 'The Opening', 7, 'Meccan'],
  [2, 'البقرة', 'Al-Baqarah', 'The Cow', 286, 'Medinan'],
  [3, 'آل عمران', "Ali 'Imran", 'Family of Imran', 200, 'Medinan'],
  [4, 'النساء', 'An-Nisa', 'The Women', 176, 'Medinan'],
  [5, 'المائدة', "Al-Ma'idah", 'The Table Spread', 120, 'Medinan'],
  [6, 'الأنعام', "Al-An'am", 'The Cattle', 165, 'Meccan'],
  [7, 'الأعراف', "Al-A'raf", 'The Heights', 206, 'Meccan'],
  [8, 'الأنفال', 'Al-Anfal', 'The Spoils of War', 75, 'Medinan'],
  [9, 'التوبة', 'At-Tawbah', 'The Repentance', 129, 'Medinan'],
  [10, 'يونس', 'Yunus', 'Jonah', 109, 'Meccan'],
  [11, 'هود', 'Hud', 'Hud', 123, 'Meccan'],
  [12, 'يوسف', 'Yusuf', 'Joseph', 111, 'Meccan'],
  [13, 'الرعد', "Ar-Ra'd", 'The Thunder', 43, 'Medinan'],
  [14, 'إبراهيم', 'Ibrahim', 'Abraham', 52, 'Meccan'],
  [15, 'الحجر', 'Al-Hijr', 'The Rocky Tract', 99, 'Meccan'],
  [16, 'النحل', 'An-Nahl', 'The Bee', 128, 'Meccan'],
  [17, 'الإسراء', 'Al-Isra', 'The Night Journey', 111, 'Meccan'],
  [18, 'الكهف', 'Al-Kahf', 'The Cave', 110, 'Meccan'],
  [19, 'مريم', 'Maryam', 'Mary', 98, 'Meccan'],
  [20, 'طه', 'Ta-Ha', 'Ta-Ha', 135, 'Meccan'],
  [21, 'الأنبياء', 'Al-Anbya', 'The Prophets', 112, 'Meccan'],
  [22, 'الحج', 'Al-Hajj', 'The Pilgrimage', 78, 'Medinan'],
  [23, 'المؤمنون', "Al-Mu'minun", 'The Believers', 118, 'Meccan'],
  [24, 'النور', 'An-Nur', 'The Light', 64, 'Medinan'],
  [25, 'الفرقان', 'Al-Furqan', 'The Criterion', 77, 'Meccan'],
  [26, 'الشعراء', "Ash-Shu'ara", 'The Poets', 227, 'Meccan'],
  [27, 'النمل', 'An-Naml', 'The Ant', 93, 'Meccan'],
  [28, 'القصص', 'Al-Qasas', 'The Stories', 88, 'Meccan'],
  [29, 'العنكبوت', "Al-'Ankabut", 'The Spider', 69, 'Meccan'],
  [30, 'الروم', 'Ar-Rum', 'The Romans', 60, 'Meccan'],
  [31, 'لقمان', 'Luqman', 'Luqman', 34, 'Meccan'],
  [32, 'السجدة', 'As-Sajdah', 'The Prostration', 30, 'Meccan'],
  [33, 'الأحزاب', 'Al-Ahzab', 'The Combined Forces', 73, 'Medinan'],
  [34, 'سبأ', 'Saba', 'Sheba', 54, 'Meccan'],
  [35, 'فاطر', 'Fatir', 'Originator', 45, 'Meccan'],
  [36, 'يس', 'Ya-Sin', 'Ya-Sin', 83, 'Meccan'],
  [37, 'الصافات', 'As-Saffat', 'Those Who Set The Ranks', 182, 'Meccan'],
  [38, 'ص', 'Sad', 'Sad', 88, 'Meccan'],
  [39, 'الزمر', 'Az-Zumar', 'The Troops', 75, 'Meccan'],
  [40, 'غافر', 'Ghafir', 'The Forgiver', 85, 'Meccan'],
  [41, 'فصلت', 'Fussilat', 'Explained in Detail', 54, 'Meccan'],
  [42, 'الشورى', 'Ash-Shuraa', 'The Consultation', 53, 'Meccan'],
  [43, 'الزخرف', 'Az-Zukhruf', 'The Ornaments of Gold', 89, 'Meccan'],
  [44, 'الدخان', 'Ad-Dukhan', 'The Smoke', 59, 'Meccan'],
  [45, 'الجاثية', 'Al-Jathiyah', 'The Crouching', 37, 'Meccan'],
  [46, 'الأحقاف', 'Al-Ahqaf', 'The Wind-Curved Sandhills', 35, 'Meccan'],
  [47, 'محمد', 'Muhammad', 'Muhammad', 38, 'Medinan'],
  [48, 'الفتح', 'Al-Fath', 'The Victory', 29, 'Medinan'],
  [49, 'الحجرات', 'Al-Hujurat', 'The Rooms', 18, 'Medinan'],
  [50, 'ق', 'Qaf', 'Qaf', 45, 'Meccan'],
  [51, 'الذاريات', 'Adh-Dhariyat', 'The Winnowing Winds', 60, 'Meccan'],
  [52, 'الطور', 'At-Tur', 'The Mount', 49, 'Meccan'],
  [53, 'النجم', 'An-Najm', 'The Star', 62, 'Meccan'],
  [54, 'القمر', 'Al-Qamar', 'The Moon', 55, 'Meccan'],
  [55, 'الرحمن', 'Ar-Rahman', 'The Beneficent', 78, 'Medinan'],
  [56, 'الواقعة', "Al-Waqi'ah", 'The Inevitable', 96, 'Meccan'],
  [57, 'الحديد', 'Al-Hadid', 'The Iron', 29, 'Medinan'],
  [58, 'المجادلة', 'Al-Mujadila', 'The Pleading Woman', 22, 'Medinan'],
  [59, 'الحشر', 'Al-Hashr', 'The Exile', 24, 'Medinan'],
  [60, 'الممتحنة', 'Al-Mumtahanah', 'She That Is To Be Examined', 13, 'Medinan'],
  [61, 'الصف', 'As-Saf', 'The Ranks', 14, 'Medinan'],
  [62, 'الجمعة', "Al-Jumu'ah", 'The Congregation', 11, 'Medinan'],
  [63, 'المنافقون', 'Al-Munafiqun', 'The Hypocrites', 11, 'Medinan'],
  [64, 'التغابن', 'At-Taghabun', 'The Mutual Disillusion', 18, 'Medinan'],
  [65, 'الطلاق', 'At-Talaq', 'The Divorce', 12, 'Medinan'],
  [66, 'التحريم', 'At-Tahrim', 'The Prohibition', 12, 'Medinan'],
  [67, 'الملك', 'Al-Mulk', 'The Sovereignty', 30, 'Meccan'],
  [68, 'القلم', 'Al-Qalam', 'The Pen', 52, 'Meccan'],
  [69, 'الحاقة', 'Al-Haqqah', 'The Reality', 52, 'Meccan'],
  [70, 'المعارج', "Al-Ma'arij", 'The Ascending Stairways', 44, 'Meccan'],
  [71, 'نوح', 'Nuh', 'Noah', 28, 'Meccan'],
  [72, 'الجن', 'Al-Jinn', 'The Jinn', 28, 'Meccan'],
  [73, 'المزمل', 'Al-Muzzammil', 'The Enshrouded One', 20, 'Meccan'],
  [74, 'المدثر', 'Al-Muddaththir', 'The Cloaked One', 56, 'Meccan'],
  [75, 'القيامة', 'Al-Qiyamah', 'The Resurrection', 40, 'Meccan'],
  [76, 'الإنسان', 'Al-Insan', 'The Man', 31, 'Medinan'],
  [77, 'المرسلات', 'Al-Mursalat', 'The Emissaries', 50, 'Meccan'],
  [78, 'النبأ', 'An-Naba', 'The Tidings', 40, 'Meccan'],
  [79, 'النازعات', "An-Nazi'at", 'Those Who Drag Forth', 46, 'Meccan'],
  [80, 'عبس', "'Abasa", 'He Frowned', 42, 'Meccan'],
  [81, 'التكوير', 'At-Takwir', 'The Overthrowing', 29, 'Meccan'],
  [82, 'الانفطار', 'Al-Infitar', 'The Cleaving', 19, 'Meccan'],
  [83, 'المطففين', 'Al-Mutaffifin', 'The Defrauding', 36, 'Meccan'],
  [84, 'الانشقاق', 'Al-Inshiqaq', 'The Sundering', 25, 'Meccan'],
  [85, 'البروج', 'Al-Buruj', 'The Mansions of the Stars', 22, 'Meccan'],
  [86, 'الطارق', 'At-Tariq', 'The Morning Star', 17, 'Meccan'],
  [87, 'الأعلى', "Al-A'la", 'The Most High', 19, 'Meccan'],
  [88, 'الغاشية', 'Al-Ghashiyah', 'The Overwhelming', 26, 'Meccan'],
  [89, 'الفجر', 'Al-Fajr', 'The Dawn', 30, 'Meccan'],
  [90, 'البلد', 'Al-Balad', 'The City', 20, 'Meccan'],
  [91, 'الشمس', 'Ash-Shams', 'The Sun', 15, 'Meccan'],
  [92, 'الليل', 'Al-Layl', 'The Night', 21, 'Meccan'],
  [93, 'الضحى', 'Ad-Duhaa', 'The Morning Hours', 11, 'Meccan'],
  [94, 'الشرح', 'Ash-Sharh', 'The Relief', 8, 'Meccan'],
  [95, 'التين', 'At-Tin', 'The Fig', 8, 'Meccan'],
  [96, 'العلق', "Al-'Alaq", 'The Clot', 19, 'Meccan'],
  [97, 'القدر', 'Al-Qadr', 'The Power', 5, 'Meccan'],
  [98, 'البينة', 'Al-Bayyinah', 'The Clear Proof', 8, 'Medinan'],
  [99, 'الزلزلة', 'Az-Zalzalah', 'The Earthquake', 8, 'Medinan'],
  [100, 'العاديات', "Al-'Adiyat", 'The Courser', 11, 'Meccan'],
  [101, 'القارعة', "Al-Qari'ah", 'The Calamity', 11, 'Meccan'],
  [102, 'التكاثر', 'At-Takathur', 'The Rivalry in World Increase', 8, 'Meccan'],
  [103, 'العصر', "Al-'Asr", 'The Declining Day', 3, 'Meccan'],
  [104, 'الهمزة', 'Al-Humazah', 'The Traducer', 9, 'Meccan'],
  [105, 'الفيل', 'Al-Fil', 'The Elephant', 5, 'Meccan'],
  [106, 'قريش', 'Quraysh', 'Quraysh', 4, 'Meccan'],
  [107, 'الماعون', "Al-Ma'un", 'The Small Kindnesses', 7, 'Meccan'],
  [108, 'الكوثر', 'Al-Kawthar', 'The Abundance', 3, 'Meccan'],
  [109, 'الكافرون', 'Al-Kafirun', 'The Disbelievers', 6, 'Meccan'],
  [110, 'النصر', 'An-Nasr', 'The Divine Support', 3, 'Medinan'],
  [111, 'المسد', 'Al-Masad', 'The Palm Fibre', 5, 'Meccan'],
  [112, 'الإخلاص', 'Al-Ikhlas', 'The Sincerity', 4, 'Meccan'],
  [113, 'الفلق', 'Al-Falaq', 'The Daybreak', 5, 'Meccan'],
  [114, 'الناس', 'An-Nas', 'Mankind', 6, 'Meccan'],
]

export const placeholderSurahs: SurahRow[] = SURAH_SEEDS.map(
  ([id, nameArabic, nameLatin, nameEnglish, versesCount, revelation]) => ({
    id,
    name_arabic: nameArabic,
    name_latin: nameLatin,
    name_english: nameEnglish,
    verses_count: versesCount,
    revelation,
    bismillah_pre: id === 1 || id === 9 ? 0 : 1,
    revelation_order: null,
    rukus: null,
  }),
)

export const placeholderReciters: ReciterRow[] = [
  {
    id: 1,
    remote_id: 'placeholder-dhikr-al-huda',
    name: 'Dhikr Al-Huda',
    style: 'Murattal',
    qirat: "Hafs 'an Asim",
    source: 'placeholder',
    license_id: 'placeholder',
    license_url: '',
    license_evidence_url: '',
    attribution: 'Placeholder voice — no recitation ships until its rights are confirmed.',
    has_segments: 1,
    enabled: 1,
  },
  {
    id: 2,
    remote_id: 'placeholder-noor-al-huda',
    name: 'Noor Al-Huda',
    style: 'Murattal (slow)',
    qirat: "Hafs 'an Asim",
    source: 'placeholder',
    license_id: 'placeholder',
    license_url: '',
    license_evidence_url: '',
    attribution: 'Placeholder voice — no recitation ships until its rights are confirmed.',
    has_segments: 1,
    enabled: 1,
  },
  {
    id: 3,
    remote_id: 'placeholder-saba-al-huda',
    name: "Saba' Al-Huda",
    style: 'Mujawwad',
    qirat: "Hafs 'an Asim",
    source: 'placeholder',
    license_id: 'placeholder',
    license_url: '',
    license_evidence_url: '',
    attribution: 'Placeholder voice — no recitation ships until its rights are confirmed.',
    has_segments: 0,
    enabled: 1,
  },
]

type CuratedVerse = [surah: number, ayah: number, arabic: string, transliteration: string]

const CURATED: CuratedVerse[] = [
  [55, 1, 'ٱلرَّحْمَٰنُ', 'Ar-Rahman'],
  [55, 2, 'عَلَّمَ ٱلْقُرْآنَ', "'Allamal-Qur'an"],
  [55, 3, 'خَلَقَ ٱلْإِنسَٰنَ', 'Khalaqal-insan'],
  [55, 4, 'عَلَّمَهُ ٱلْبَيَانَ', "'Allamahul-bayan"],
  [55, 5, 'ٱلشَّمْسُ وَٱلْقَمَرُ بِحُسْبَانٍ', 'Ash-shamsu wal-qamaru bi-husban'],
  [55, 6, 'وَٱلنَّجْمُ وَٱلشَّجَرُ يَسْجُدَانِ', 'Wan-najmu wash-shajaru yasjudan'],
  [55, 7, 'وَٱلسَّمَآءَ رَفَعَهَا وَوَضَعَ ٱلْمِيزَانَ', "Was-sama'a rafa'aha wa wada'al-mizan"],
  [55, 8, 'أَلَّا تَطْغَوْا۟ فِى ٱلْمِيزَانِ', 'Alla tatghaw fil-mizan'],
  [55, 9, 'وَأَقِيمُوا۟ ٱلْوَزْنَ بِٱلْقِسْطِ وَلَا تُخْسِرُوا۟ ٱلْمِيزَانَ', 'Wa aqimul-wazna bil-qisti wa la tukhsurul-mizan'],
  [55, 10, 'وَٱلْأَرْضَ وَضَعَهَا لِلْأَنَامِ', "Wal-arda wada'aha lil-anam"],
  [55, 11, 'فِيهَا فَٰكِهَةٌ وَٱلنَّخْلُ ذَاتُ ٱلْأَكْمَامِ', 'Fiha fakihatun wan-nakhlu dhatul-akmam'],
  [55, 12, 'وَٱلْحَبُّ ذُو ٱلْعَصْفِ وَٱلرَّيْحَانُ', "Wal-habbu dhul-'asfi war-rayhan"],
  [55, 13, 'فَبِأَىِّ ءَالَآءِ رَبِّكُمَا تُكَذِّبَانِ', "Fa-bi-ayyi ala'i Rabbikuma tukadhdhiban"],
  [55, 14, 'خَلَقَ ٱلْإِنسَٰنَ مِن صَلْصَٰلٍ كَٱلْفَخَّارِ', 'Khalaqal-insana min salsalin kal-fakhkhar'],
  [55, 15, 'وَخَلَقَ ٱلْجَآنَّ مِن مَّارِجٍ مِّن نَّارٍ', 'Wa khalaqal-janna min marijin min nar'],
  [55, 16, 'فَبِأَىِّ ءَالَآءِ رَبِّكُمَا تُكَذِّبَانِ', "Fa-bi-ayyi ala'i Rabbikuma tukadhdhiban"],
  [1, 1, 'بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ', 'Bismillahir-Rahmanir-Rahim'],
  [1, 2, 'ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَٰلَمِينَ', "Al-hamdu lillahi Rabbil-'alamin"],
  [1, 3, 'ٱلرَّحْمَٰنِ ٱلرَّحِيمِ', 'Ar-Rahmanir-Rahim'],
  [1, 4, 'مَٰلِكِ يَوْمِ ٱلدِّينِ', 'Maliki yawmid-din'],
  [1, 5, 'إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ', "Iyyaka na'budu wa iyyaka nasta'in"],
  [1, 6, 'ٱهْدِنَا ٱلصِّرَٰطَ ٱلْمُسْتَقِيمَ', 'Ihdinas-siratal-mustaqim'],
  [1, 7, 'صِرَٰطَ ٱلَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ ٱلْمَغْضُوبِ عَلَيْهِمْ وَلَا ٱلضَّآلِّينَ', "Siratal-ladhina an'amta 'alayhim, ghayril-maghdubi 'alayhim wa lad-dallin"],
  [112, 1, 'قُلْ هُوَ ٱللَّهُ أَحَدٌ', 'Qul huwallahu ahad'],
  [112, 2, 'ٱللَّهُ ٱلصَّمَدُ', 'Allahus-samad'],
  [112, 3, 'لَمْ يَلِدْ وَلَمْ يُولَدْ', 'Lam yalid wa lam yulad'],
  [112, 4, 'وَلَمْ يَكُن لَّهُۥ كُفُوًا أَحَدٌ', 'Wa lam yakul-lahu kufuwan ahad'],
  [113, 1, 'قُلْ أَعُوذُ بِرَبِّ ٱلْفَلَقِ', "Qul a'udhu bi-Rabbil-falaq"],
  [113, 2, 'مِن شَرِّ مَا خَلَقَ', 'Min sharri ma khalaq'],
  [113, 3, 'وَمِن شَرِّ غَاسِقٍ إِذَا وَقَبَ', 'Wa min sharri ghasiqin idha waqab'],
  [113, 4, 'وَمِن شَرِّ ٱلنَّفَّٰثَٰتِ فِى ٱلْعُقَدِ', "Wa min sharrin-naffathati fil-'uqad"],
  [113, 5, 'وَمِن شَرِّ حَاسِدٍ إِذَا حَسَدَ', 'Wa min sharri hasidin idha hasad'],
  [114, 1, 'قُلْ أَعُوذُ بِرَبِّ ٱلنَّاسِ', "Qul a'udhu bi-Rabbin-nas"],
  [114, 2, 'مَلِكِ ٱلنَّاسِ', 'Malikin-nas'],
  [114, 3, 'إِلَٰهِ ٱلنَّاسِ', 'Ilahin-nas'],
  [114, 4, 'مِن شَرِّ ٱلْوَسْوَاسِ ٱلْخَنَّاسِ', 'Min sharril-waswasil-khannas'],
  [114, 5, 'ٱلَّذِى يُوَسْوِسُ فِى صُدُورِ ٱلنَّاسِ', 'Alladhi yuwaswisu fi sudurin-nas'],
  [114, 6, 'مِنَ ٱلْجِنَّةِ وَٱلنَّاسِ', 'Minal-jinnati wan-nas'],
]

const curatedByKey = new Map(
  CURATED.map(([surah, ayah, arabic, translit]) => [`${surah}:${ayah}`, { arabic, translit }]),
)

/** Cumulative Quran-wide ayah ids for the placeholder surah table. */
function placeholderAyahId(surahId: number, ayah: number): number {
  let offset = 0
  for (const surah of placeholderSurahs) {
    if (surah.id === surahId) return offset + ayah
    offset += surah.verses_count
  }
  return 0
}

const surahById = new Map(placeholderSurahs.map((surah) => [surah.id, surah]))

export function placeholderAyah(surahId: number, ayah: number): AyahRow {
  const surah = surahById.get(surahId)
  const curated = curatedByKey.get(`${surahId}:${ayah}`)
  const verseKey = `${surahId}:${ayah}`
  return {
    id: placeholderAyahId(surahId, ayah),
    surah_id: surahId,
    ayah,
    verse_key: verseKey,
    text_uthmani: curated?.arabic ?? `﴿ ${surahId}:${ayah} ﴾`,
    juz: null,
    hizb: null,
    page: null,
    sajdah: 0,
    sajdah_type: null,
    transliteration:
      curated?.translit ??
      `Placeholder reading for verse ${verseKey}. The content pipeline will replace this text with the Tanzil transliteration.`,
  }
}

export function placeholderAyahsFor(surahId: number): AyahRow[] {
  const surah = surahById.get(surahId)
  if (!surah) return []
  const ayahs: AyahRow[] = []
  for (let ayah = 1; ayah <= surah.verses_count; ayah += 1) {
    ayahs.push(placeholderAyah(surahId, ayah))
  }
  return ayahs
}

export function placeholderWords(ayah: AyahRow): WordRow[] {
  const tokens = ayah.transliteration.split(/\s+/).filter(Boolean)
  // Uthmani tokens are only attached when the token counts match, mirroring the
  // pipeline rule; placeholder Arabic is not split otherwise.
  const uthmaniTokens = ayah.text_uthmani.startsWith('﴿') ? [] : ayah.text_uthmani.split(/\s+/)
  const aligned = uthmaniTokens.length === tokens.length
  return tokens.map((token, index) => ({
    ayah_id: ayah.id,
    position: index + 1,
    text_uthmani: aligned ? uthmaniTokens[index] : null,
    transliteration: token,
  }))
}

/**
 * Deterministic placeholder word timings, so word highlighting and Media
 * Session position reporting work end to end before the pipeline lands.
 */
export function placeholderSegments(ayah: AyahRow, reciterId = 1): SegmentRow[] {
  const words = placeholderWords(ayah)
  const intro = 400
  const perWord = 620
  const segments: SegmentRow[] = [
    {
      reciter_id: reciterId,
      variant: 'default',
      ayah_id: ayah.id,
      word_index: 0,
      start_ms: 0,
      end_ms: intro + perWord * Math.max(1, words.length) + 400,
    },
  ]
  words.forEach((word, index) => {
    const start = intro + index * perWord
    segments.push({
      reciter_id: reciterId,
      variant: 'default',
      ayah_id: ayah.id,
      word_index: index + 1,
      start_ms: start,
      end_ms: start + perWord,
    })
  })
  return segments
}

export const placeholderAudioFiles: AudioFileRow[] = []

export const placeholderSummary: ContentSummary = {
  mode: 'placeholder',
  source: 'placeholder',
  schema_version: 1,
  bundle_id: 'placeholder',
  counts: {
    surahs: placeholderSurahs.length,
    ayahs: placeholderSurahs.reduce((total, surah) => total + surah.verses_count, 0),
    reciters: placeholderReciters.length,
    segments: 0,
    audio_files: 0,
  },
  cached_surahs: 0,
  cached_segment_sets: 0,
  licenses: [
    {
      id: 'tanzil-quran-text',
      name: 'Tanzil Uthmani 1.1',
      url: 'https://tanzil.net/download/',
      attribution: 'Quran text from the Tanzil Project, used verbatim and unmodified.',
    },
    {
      id: 'tanzil-transliteration-permission',
      name: 'Tanzil English transliteration (written grant)',
      url: 'https://tanzil.net/trans/',
      attribution: 'English transliteration used under a written grant held by the app owners.',
    },
    {
      id: 'quran-align',
      name: 'quran-align word timings (CC BY 4.0)',
      url: 'https://github.com/cpfair/quran-align',
      attribution: 'Word timings from quran-align by Collin Fair, CC BY 4.0.',
    },
  ],
  attribution: [
    'Quran text from the Tanzil Project.',
    'English transliteration used under a written grant.',
    'Word timings from quran-align by Collin Fair (CC BY 4.0).',
  ],
}
