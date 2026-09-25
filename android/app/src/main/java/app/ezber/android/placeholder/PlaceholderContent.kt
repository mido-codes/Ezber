package app.ezber.android.placeholder

import app.ezber.android.models.DisplayOptions
import app.ezber.android.models.Iso8601
import app.ezber.android.models.MemorizationState
import app.ezber.android.models.Note
import app.ezber.android.models.Preset
import app.ezber.android.models.Reciter
import app.ezber.android.models.RepeatPlan
import app.ezber.android.models.RevelationPlace
import app.ezber.android.models.Surah
import app.ezber.android.models.Translation
import app.ezber.android.models.Verse
import app.ezber.android.models.VerseId
import app.ezber.android.models.VerseProgress
import app.ezber.android.models.VerseRange
import java.time.Instant

// PLACEHOLDER CONTENT — this file exists so every screen renders before the
// content pipeline lands. It is not the app's content source:
//   * Surah metadata (names, verse counts) is real enough to browse.
//   * Curated verses are marked in code as placeholder readings.
//   * Translations are provisional and attributed to Pickthall.
// Attribution/licensing is tracked by the rights work under `licenses/`; the
// Credits screen points at that registry.
object PlaceholderContent {

    // MARK: - Surahs

    val surahs: List<Surah> = surahTable()

    // MARK: - Reciters

    val reciters: List<Reciter> = listOf(
        Reciter(
            id = 1,
            remoteId = "dhikr-al-huda",
            name = "Dhikr Al-Huda",
            style = "Murattal",
            qirat = "Hafs 'an Asim",
            attribution = "Dhikr Al-Huda (placeholder reciter)",
            licenseId = "placeholder-cc-by-4.0",
        ),
        Reciter(
            id = 2,
            remoteId = "mishary-alafasy",
            name = "Mishary Rashid Alafasy",
            style = "Murattal",
            qirat = "Hafs 'an Asim",
            attribution = "Mishary Rashid Alafasy (placeholder entry)",
            licenseId = "placeholder-rights-pending",
        ),
        Reciter(
            id = 3,
            remoteId = "abdul-basit",
            name = "Abdul Basit Abdus Samad",
            style = "Mujawwad",
            qirat = "Hafs 'an Asim",
            attribution = "Abdul Basit Abdus Samad (placeholder entry)",
            licenseId = "placeholder-rights-pending",
        ),
    )

    // MARK: - Seeded user data

    val seededPresets: List<Preset> = listOf(
        Preset(
            id = 1,
            name = "Ar-Rahman 1–5",
            surahId = 55,
            range = VerseRange(1, 5),
            repeats = RepeatPlan(defaultRepeats = 5),
            reciterId = 1,
            createdAt = stamp(86_400 * 3),
            updatedAt = stamp(3_600),
            lastUsedAt = stamp(3_600),
        ),
        Preset(
            id = 2,
            name = "Al-Mulk evening",
            surahId = 67,
            range = VerseRange(1, 5),
            repeats = RepeatPlan(defaultRepeats = 3),
            reciterId = 1,
            createdAt = stamp(86_400 * 2),
            updatedAt = stamp(7_200),
        ),
        Preset(
            id = 3,
            name = "Al-Fatihah warm-up",
            surahId = 1,
            range = VerseRange(1, 7),
            repeats = RepeatPlan(defaultRepeats = 3),
            reciterId = 2,
            display = DisplayOptions(showArabic = true),
            createdAt = stamp(86_400),
            updatedAt = stamp(86_400),
        ),
    )

    val seededProgress: List<VerseProgress> = listOf(
        VerseProgress(
            presetId = 1,
            verseId = VerseId(55, 1),
            repetitionsDone = 12,
            state = MemorizationState.REVIEW,
            lastPlayedAt = stamp(3_600),
        ),
        VerseProgress(
            presetId = 1,
            verseId = VerseId(55, 2),
            repetitionsDone = 7,
            state = MemorizationState.LEARNING,
            lastPlayedAt = stamp(3_500),
        ),
        VerseProgress(
            presetId = 1,
            verseId = VerseId(55, 3),
            repetitionsDone = 2,
            state = MemorizationState.LEARNING,
            lastPlayedAt = stamp(3_400),
        ),
        VerseProgress(
            presetId = 3,
            verseId = VerseId(1, 1),
            repetitionsDone = 31,
            state = MemorizationState.MEMORIZED,
            lastPlayedAt = stamp(86_400),
        ),
    )

    val seededNotes: List<Note> = listOf(
        Note(
            id = 1,
            verseKey = "55:1",
            bodyMarkdown = "Start low and let the first line settle before repeating.",
            createdAt = stamp(7_200),
            updatedAt = stamp(7_200),
        ),
        Note(
            id = 2,
            verseKey = "55:4",
            bodyMarkdown = "${Note.VOICE_MEMO_PREFIX} · memo-55-4.m4a — watch the madd on \"al-bayan\".",
            createdAt = stamp(3_600),
            updatedAt = stamp(3_600),
        ),
    )

    private fun stamp(secondsAgo: Long): String = Iso8601.format(Instant.now().minusSeconds(secondsAgo))

    // MARK: - Generated verses

    /** A clearly fake verse used when the curated set does not cover a position. */
    fun generatedVerse(surahId: Int, number: Int): Verse = Verse(
        surahId = surahId,
        number = number,
        arabic = "﴿ placeholder Arabic · $surahId:$number ﴾",
        transliteration = "Placeholder transliteration for verse $surahId:$number. " +
            "The content pipeline will replace this reading.",
        translations = listOf(
            Translation(
                id = "placeholder",
                translator = "Placeholder",
                languageCode = "en",
                text = "Placeholder translation for verse $surahId:$number.",
            ),
        ),
    )

    // MARK: - Curated verses

    val curatedVerses: List<Verse> = listOf(
        verse(55, 1, "ٱلرَّحْمَٰنُ", "Ar-Rahman", "The Beneficent"),
        verse(55, 2, "عَلَّمَ ٱلْقُرْآنَ", "'Allamal-Qur'an", "Hath taught the Qur'an"),
        verse(55, 3, "خَلَقَ ٱلْإِنسَٰنَ", "Khalaqal-insan", "He created man"),
        verse(55, 4, "عَلَّمَهُ ٱلْبَيَانَ", "'Allamahul-bayan", "Hath taught him eloquent speech"),
        verse(55, 5, "ٱلشَّمْسُ وَٱلْقَمَرُ بِحُسْبَانٍ", "Ash-shamsu wal-qamaru bi-husban", "The sun and the moon run on their fixed courses"),
        verse(55, 6, "وَٱلنَّجْمُ وَٱلشَّجَرُ يَسْجُدَانِ", "Wan-najmu wash-shajaru yasjudan", "And the herbs and the trees bow in adoration"),
        verse(55, 7, "وَٱلسَّمَآءَ رَفَعَهَا وَوَضَعَ ٱلْمِيزَانَ", "Was-sama'a rafa'aha wa wada'al-mizan", "And the heaven He hath raised and imposed the balance"),
        verse(55, 8, "أَلَّا تَطْغَوْا۟ فِى ٱلْمِيزَانِ", "Alla tatghaw fil-mizan", "That ye transgress not the balance"),
        verse(55, 9, "وَأَقِيمُوا۟ ٱلْوَزْنَ بِٱلْقِسْطِ وَلَا تُخْسِرُوا۟ ٱلْمِيزَانَ", "Wa aqimul-wazna bil-qisti wa la tukhsurul-mizan", "But keep the measure just and fall not short thereof"),
        verse(55, 10, "وَٱلْأَرْضَ وَضَعَهَا لِلْأَنَامِ", "Wal-arda wada'aha lil-anam", "And the earth hath He appointed for His creatures"),
        verse(55, 11, "فِيهَا فَٰكِهَةٌ وَٱلنَّخْلُ ذَاتُ ٱلْأَكْمَامِ", "Fiha fakihatun wan-nakhlu dhatul-akmam", "Wherein are fruit and sheathed palm trees"),
        verse(55, 12, "وَٱلْحَبُّ ذُو ٱلْعَصْفِ وَٱلرَّيْحَانُ", "Wal-habbu dhul-'asfi war-rayhan", "Husked grain and scented herb"),
        verse(55, 13, "فَبِأَىِّ ءَالَآءِ رَبِّكُمَا تُكَذِّبَانِ", "Fa-bi-ayyi ala'i Rabbikuma tukadhdhiban", "Which is it, of the favours of your Lord, that ye deny?"),
        verse(55, 14, "خَلَقَ ٱلْإِنسَٰنَ مِن صَلْصَٰلٍ كَٱلْفَخَّارِ", "Khalaqal-insana min salsalin kal-fakhkhar", "He created man of clay like the potter's"),
        verse(55, 15, "وَخَلَقَ ٱلْجَآنَّ مِن مَّارِجٍ مِّن نَّارٍ", "Wa khalaqal-janna min marijin min nar", "And the jinn did He create of smokeless fire"),
        verse(55, 16, "فَبِأَىِّ ءَالَآءِ رَبِّكُمَا تُكَذِّبَانِ", "Fa-bi-ayyi ala'i Rabbikuma tukadhdhiban", "Which is it, of the favours of your Lord, that ye deny?"),

        verse(1, 1, "بِسْمِ ٱللَّهِ ٱلرَّحْمَٰنِ ٱلرَّحِيمِ", "Bismillahir-Rahmanir-Rahim", "In the name of Allah, the Beneficent, the Merciful"),
        verse(1, 2, "ٱلْحَمْدُ لِلَّهِ رَبِّ ٱلْعَٰلَمِينَ", "Al-hamdu lillahi Rabbil-'alamin", "Praise be to Allah, Lord of the Worlds"),
        verse(1, 3, "ٱلرَّحْمَٰنِ ٱلرَّحِيمِ", "Ar-Rahmanir-Rahim", "The Beneficent, the Merciful"),
        verse(1, 4, "مَٰلِكِ يَوْمِ ٱلدِّينِ", "Maliki yawmid-din", "Master of the Day of Judgment"),
        verse(1, 5, "إِيَّاكَ نَعْبُدُ وَإِيَّاكَ نَسْتَعِينُ", "Iyyaka na'budu wa iyyaka nasta'in", "Thee (alone) we worship; Thee (alone) we ask for help"),
        verse(1, 6, "ٱهْدِنَا ٱلصِّرَٰطَ ٱلْمُسْتَقِيمَ", "Ihdinas-siratal-mustaqim", "Show us the straight path"),
        verse(1, 7, "صِرَٰطَ ٱلَّذِينَ أَنْعَمْتَ عَلَيْهِمْ غَيْرِ ٱلْمَغْضُوبِ عَلَيْهِمْ وَلَا ٱلضَّآلِّينَ", "Siratal-ladhina an'amta 'alayhim, ghayril-maghdubi 'alayhim wa lad-dallin", "The path of those whom Thou hast favoured; not the path of those who earn Thine anger nor of those who go astray"),

        verse(112, 1, "قُلْ هُوَ ٱللَّهُ أَحَدٌ", "Qul huwallahu ahad", "Say: He is Allah, the One!"),
        verse(112, 2, "ٱللَّهُ ٱلصَّمَدُ", "Allahus-samad", "Allah, the eternally Besought of all!"),
        verse(112, 3, "لَمْ يَلِدْ وَلَمْ يُولَدْ", "Lam yalid wa lam yulad", "He begetteth not nor was begotten"),
        verse(112, 4, "وَلَمْ يَكُن لَّهُۥ كُفُوًا أَحَدٌ", "Wa lam yakul-lahu kufuwan ahad", "And there is none comparable unto Him"),

        verse(113, 1, "قُلْ أَعُوذُ بِرَبِّ ٱلْفَلَقِ", "Qul a'udhu bi-Rabbil-falaq", "Say: I seek refuge in the Lord of the Daybreak"),
        verse(113, 2, "مِن شَرِّ مَا خَلَقَ", "Min sharri ma khalaq", "From the evil of that which He created"),
        verse(113, 3, "وَمِن شَرِّ غَاسِقٍ إِذَا وَقَبَ", "Wa min sharri ghasiqin idha waqab", "From the evil of the darkness when it is intense"),
        verse(113, 4, "وَمِن شَرِّ ٱلنَّفَّٰثَٰتِ فِى ٱلْعُقَدِ", "Wa min sharrin-naffathati fil-'uqad", "And from the evil of malignant witchcraft"),
        verse(113, 5, "وَمِن شَرِّ حَاسِدٍ إِذَا حَسَدَ", "Wa min sharri hasidin idha hasad", "And from the evil of the envier when he envieth"),

        verse(114, 1, "قُلْ أَعُوذُ بِرَبِّ ٱلنَّاسِ", "Qul a'udhu bi-Rabbin-nas", "Say: I seek refuge in the Lord of mankind"),
        verse(114, 2, "مَلِكِ ٱلنَّاسِ", "Malikin-nas", "The King of mankind"),
        verse(114, 3, "إِلَٰهِ ٱلنَّاسِ", "Ilahin-nas", "The God of mankind"),
        verse(114, 4, "مِن شَرِّ ٱلْوَسْوَاسِ ٱلْخَنَّاسِ", "Min sharril-waswasil-khannas", "From the evil of the sneaking whisperer"),
        verse(114, 5, "ٱلَّذِى يُوَسْوِسُ فِى صُدُورِ ٱلنَّاسِ", "Alladhi yuwaswisu fi sudurin-nas", "Who whispereth in the hearts of mankind"),
        verse(114, 6, "مِنَ ٱلْجِنَّةِ وَٱلنَّاسِ", "Minal-jinnati wan-nas", "Of the jinn and of mankind"),
    )

    private fun verse(
        surah: Int,
        number: Int,
        arabic: String,
        transliteration: String,
        translation: String,
    ): Verse = Verse(
        surahId = surah,
        number = number,
        arabic = arabic,
        transliteration = transliteration,
        translations = listOf(
            Translation(
                id = "pickthall",
                translator = "M. M. Pickthall",
                languageCode = "en",
                text = translation,
            ),
        ),
    )

    // MARK: - Surah table

    private fun surahTable(): List<Surah> = listOf(
        s(1, "الفاتحة", "Al-Fatihah", "The Opening", 7, RevelationPlace.MECCAN, bismillah = false),
        s(2, "البقرة", "Al-Baqarah", "The Cow", 286, RevelationPlace.MEDINAN),
        s(3, "آل عمران", "Ali 'Imran", "Family of Imran", 200, RevelationPlace.MEDINAN),
        s(4, "النساء", "An-Nisa", "The Women", 176, RevelationPlace.MEDINAN),
        s(5, "المائدة", "Al-Ma'idah", "The Table Spread", 120, RevelationPlace.MEDINAN),
        s(6, "الأنعام", "Al-An'am", "The Cattle", 165, RevelationPlace.MECCAN),
        s(7, "الأعراف", "Al-A'raf", "The Heights", 206, RevelationPlace.MECCAN),
        s(8, "الأنفال", "Al-Anfal", "The Spoils of War", 75, RevelationPlace.MEDINAN),
        s(9, "التوبة", "At-Tawbah", "The Repentance", 129, RevelationPlace.MEDINAN, bismillah = false),
        s(10, "يونس", "Yunus", "Jonah", 109, RevelationPlace.MECCAN),
        s(11, "هود", "Hud", "Hud", 123, RevelationPlace.MECCAN),
        s(12, "يوسف", "Yusuf", "Joseph", 111, RevelationPlace.MECCAN),
        s(13, "الرعد", "Ar-Ra'd", "The Thunder", 43, RevelationPlace.MEDINAN),
        s(14, "إبراهيم", "Ibrahim", "Abraham", 52, RevelationPlace.MECCAN),
        s(15, "الحجر", "Al-Hijr", "The Rocky Tract", 99, RevelationPlace.MECCAN),
        s(16, "النحل", "An-Nahl", "The Bee", 128, RevelationPlace.MECCAN),
        s(17, "الإسراء", "Al-Isra", "The Night Journey", 111, RevelationPlace.MECCAN),
        s(18, "الكهف", "Al-Kahf", "The Cave", 110, RevelationPlace.MECCAN),
        s(19, "مريم", "Maryam", "Mary", 98, RevelationPlace.MECCAN),
        s(20, "طه", "Ta-Ha", "Ta-Ha", 135, RevelationPlace.MECCAN),
        s(21, "الأنبياء", "Al-Anbya", "The Prophets", 112, RevelationPlace.MECCAN),
        s(22, "الحج", "Al-Hajj", "The Pilgrimage", 78, RevelationPlace.MEDINAN),
        s(23, "المؤمنون", "Al-Mu'minun", "The Believers", 118, RevelationPlace.MECCAN),
        s(24, "النور", "An-Nur", "The Light", 64, RevelationPlace.MEDINAN),
        s(25, "الفرقان", "Al-Furqan", "The Criterion", 77, RevelationPlace.MECCAN),
        s(26, "الشعراء", "Ash-Shu'ara", "The Poets", 227, RevelationPlace.MECCAN),
        s(27, "النمل", "An-Naml", "The Ant", 93, RevelationPlace.MECCAN),
        s(28, "القصص", "Al-Qasas", "The Stories", 88, RevelationPlace.MECCAN),
        s(29, "العنكبوت", "Al-'Ankabut", "The Spider", 69, RevelationPlace.MECCAN),
        s(30, "الروم", "Ar-Rum", "The Romans", 60, RevelationPlace.MECCAN),
        s(31, "لقمان", "Luqman", "Luqman", 34, RevelationPlace.MECCAN),
        s(32, "السجدة", "As-Sajdah", "The Prostration", 30, RevelationPlace.MECCAN),
        s(33, "الأحزاب", "Al-Ahzab", "The Combined Forces", 73, RevelationPlace.MEDINAN),
        s(34, "سبأ", "Saba", "Sheba", 54, RevelationPlace.MECCAN),
        s(35, "فاطر", "Fatir", "Originator", 45, RevelationPlace.MECCAN),
        s(36, "يس", "Ya-Sin", "Ya-Sin", 83, RevelationPlace.MECCAN),
        s(37, "الصافات", "As-Saffat", "Those Who Set The Ranks", 182, RevelationPlace.MECCAN),
        s(38, "ص", "Sad", "Sad", 88, RevelationPlace.MECCAN),
        s(39, "الزمر", "Az-Zumar", "The Troops", 75, RevelationPlace.MECCAN),
        s(40, "غافر", "Ghafir", "The Forgiver", 85, RevelationPlace.MECCAN),
        s(41, "فصلت", "Fussilat", "Explained in Detail", 54, RevelationPlace.MECCAN),
        s(42, "الشورى", "Ash-Shuraa", "The Consultation", 53, RevelationPlace.MECCAN),
        s(43, "الزخرف", "Az-Zukhruf", "The Ornaments of Gold", 89, RevelationPlace.MECCAN),
        s(44, "الدخان", "Ad-Dukhan", "The Smoke", 59, RevelationPlace.MECCAN),
        s(45, "الجاثية", "Al-Jathiyah", "The Crouching", 37, RevelationPlace.MECCAN),
        s(46, "الأحقاف", "Al-Ahqaf", "The Wind-Curved Sandhills", 35, RevelationPlace.MECCAN),
        s(47, "محمد", "Muhammad", "Muhammad", 38, RevelationPlace.MEDINAN),
        s(48, "الفتح", "Al-Fath", "The Victory", 29, RevelationPlace.MEDINAN),
        s(49, "الحجرات", "Al-Hujurat", "The Rooms", 18, RevelationPlace.MEDINAN),
        s(50, "ق", "Qaf", "Qaf", 45, RevelationPlace.MECCAN),
        s(51, "الذاريات", "Adh-Dhariyat", "The Winnowing Winds", 60, RevelationPlace.MECCAN),
        s(52, "الطور", "At-Tur", "The Mount", 49, RevelationPlace.MECCAN),
        s(53, "النجم", "An-Najm", "The Star", 62, RevelationPlace.MECCAN),
        s(54, "القمر", "Al-Qamar", "The Moon", 55, RevelationPlace.MECCAN),
        s(55, "الرحمن", "Ar-Rahman", "The Beneficent", 78, RevelationPlace.MEDINAN),
        s(56, "الواقعة", "Al-Waqi'ah", "The Inevitable", 96, RevelationPlace.MECCAN),
        s(57, "الحديد", "Al-Hadid", "The Iron", 29, RevelationPlace.MEDINAN),
        s(58, "المجادلة", "Al-Mujadila", "The Pleading Woman", 22, RevelationPlace.MEDINAN),
        s(59, "الحشر", "Al-Hashr", "The Exile", 24, RevelationPlace.MEDINAN),
        s(60, "الممتحنة", "Al-Mumtahanah", "She That Is To Be Examined", 13, RevelationPlace.MEDINAN),
        s(61, "الصف", "As-Saf", "The Ranks", 14, RevelationPlace.MEDINAN),
        s(62, "الجمعة", "Al-Jumu'ah", "The Congregation", 11, RevelationPlace.MEDINAN),
        s(63, "المنافقون", "Al-Munafiqun", "The Hypocrites", 11, RevelationPlace.MEDINAN),
        s(64, "التغابن", "At-Taghabun", "The Mutual Disillusion", 18, RevelationPlace.MEDINAN),
        s(65, "الطلاق", "At-Talaq", "The Divorce", 12, RevelationPlace.MEDINAN),
        s(66, "التحريم", "At-Tahrim", "The Prohibition", 12, RevelationPlace.MEDINAN),
        s(67, "الملك", "Al-Mulk", "The Sovereignty", 30, RevelationPlace.MECCAN),
        s(68, "القلم", "Al-Qalam", "The Pen", 52, RevelationPlace.MECCAN),
        s(69, "الحاقة", "Al-Haqqah", "The Reality", 52, RevelationPlace.MECCAN),
        s(70, "المعارج", "Al-Ma'arij", "The Ascending Stairways", 44, RevelationPlace.MECCAN),
        s(71, "نوح", "Nuh", "Noah", 28, RevelationPlace.MECCAN),
        s(72, "الجن", "Al-Jinn", "The Jinn", 28, RevelationPlace.MECCAN),
        s(73, "المزمل", "Al-Muzzammil", "The Enshrouded One", 20, RevelationPlace.MECCAN),
        s(74, "المدثر", "Al-Muddaththir", "The Cloaked One", 56, RevelationPlace.MECCAN),
        s(75, "القيامة", "Al-Qiyamah", "The Resurrection", 40, RevelationPlace.MECCAN),
        s(76, "الإنسان", "Al-Insan", "The Man", 31, RevelationPlace.MEDINAN),
        s(77, "المرسلات", "Al-Mursalat", "The Emissaries", 50, RevelationPlace.MECCAN),
        s(78, "النبأ", "An-Naba", "The Tidings", 40, RevelationPlace.MECCAN),
        s(79, "النازعات", "An-Nazi'at", "Those Who Drag Forth", 46, RevelationPlace.MECCAN),
        s(80, "عبس", "'Abasa", "He Frowned", 42, RevelationPlace.MECCAN),
        s(81, "التكوير", "At-Takwir", "The Overthrowing", 29, RevelationPlace.MECCAN),
        s(82, "الانفطار", "Al-Infitar", "The Cleaving", 19, RevelationPlace.MECCAN),
        s(83, "المطففين", "Al-Mutaffifin", "The Defrauding", 36, RevelationPlace.MECCAN),
        s(84, "الانشقاق", "Al-Inshiqaq", "The Sundering", 25, RevelationPlace.MECCAN),
        s(85, "البروج", "Al-Buruj", "The Mansions of the Stars", 22, RevelationPlace.MECCAN),
        s(86, "الطارق", "At-Tariq", "The Morning Star", 17, RevelationPlace.MECCAN),
        s(87, "الأعلى", "Al-A'la", "The Most High", 19, RevelationPlace.MECCAN),
        s(88, "الغاشية", "Al-Ghashiyah", "The Overwhelming", 26, RevelationPlace.MECCAN),
        s(89, "الفجر", "Al-Fajr", "The Dawn", 30, RevelationPlace.MECCAN),
        s(90, "البلد", "Al-Balad", "The City", 20, RevelationPlace.MECCAN),
        s(91, "الشمس", "Ash-Shams", "The Sun", 15, RevelationPlace.MECCAN),
        s(92, "الليل", "Al-Layl", "The Night", 21, RevelationPlace.MECCAN),
        s(93, "الضحى", "Ad-Duhaa", "The Morning Hours", 11, RevelationPlace.MECCAN),
        s(94, "الشرح", "Ash-Sharh", "The Relief", 8, RevelationPlace.MECCAN),
        s(95, "التين", "At-Tin", "The Fig", 8, RevelationPlace.MECCAN),
        s(96, "العلق", "Al-'Alaq", "The Clot", 19, RevelationPlace.MECCAN),
        s(97, "القدر", "Al-Qadr", "The Power", 5, RevelationPlace.MECCAN),
        s(98, "البينة", "Al-Bayyinah", "The Clear Proof", 8, RevelationPlace.MEDINAN),
        s(99, "الزلزلة", "Az-Zalzalah", "The Earthquake", 8, RevelationPlace.MEDINAN),
        s(100, "العاديات", "Al-'Adiyat", "The Courser", 11, RevelationPlace.MECCAN),
        s(101, "القارعة", "Al-Qari'ah", "The Calamity", 11, RevelationPlace.MECCAN),
        s(102, "التكاثر", "At-Takathur", "The Rivalry in World Increase", 8, RevelationPlace.MECCAN),
        s(103, "العصر", "Al-'Asr", "The Declining Day", 3, RevelationPlace.MECCAN),
        s(104, "الهمزة", "Al-Humazah", "The Traducer", 9, RevelationPlace.MECCAN),
        s(105, "الفيل", "Al-Fil", "The Elephant", 5, RevelationPlace.MECCAN),
        s(106, "قريش", "Quraysh", "Quraysh", 4, RevelationPlace.MECCAN),
        s(107, "الماعون", "Al-Ma'un", "The Small Kindnesses", 7, RevelationPlace.MECCAN),
        s(108, "الكوثر", "Al-Kawthar", "The Abundance", 3, RevelationPlace.MECCAN),
        s(109, "الكافرون", "Al-Kafirun", "The Disbelievers", 6, RevelationPlace.MECCAN),
        s(110, "النصر", "An-Nasr", "The Divine Support", 3, RevelationPlace.MEDINAN),
        s(111, "المسد", "Al-Masad", "The Palm Fibre", 5, RevelationPlace.MECCAN),
        s(112, "الإخلاص", "Al-Ikhlas", "The Sincerity", 4, RevelationPlace.MECCAN),
        s(113, "الفلق", "Al-Falaq", "The Daybreak", 5, RevelationPlace.MECCAN),
        s(114, "الناس", "An-Nas", "Mankind", 6, RevelationPlace.MECCAN),
    )

    private fun s(
        id: Int,
        arabic: String,
        latin: String,
        english: String,
        verses: Int,
        place: RevelationPlace,
        bismillah: Boolean = true,
    ): Surah = Surah(
        id = id,
        nameArabic = arabic,
        nameLatin = latin,
        nameEnglish = english,
        verseCount = verses,
        revelationPlace = place,
        bismillahPre = bismillah,
    )
}
