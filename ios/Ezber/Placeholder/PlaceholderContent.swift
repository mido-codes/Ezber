import Foundation

// PLACEHOLDER CONTENT — this file exists so every screen renders before the
// content pipeline lands. It is not the app's content source:
//   * Surah metadata (names, verse counts) is real enough to browse.
//   * Curated verses are marked in code as placeholder readings.
//   * Translations are provisional and attributed to Pickthall.
// Attribution/licensing is tracked by the rights work under `licenses/`; the
// Credits screen points at that registry.
enum PlaceholderContent {

    // MARK: - Surahs

    static let surahs: [Surah] = surahTable.map { entry in
        Surah(
            id: entry.id,
            nameArabic: entry.arabic,
            nameLatin: entry.latin,
            nameEnglish: entry.english,
            verseCount: entry.verses,
            revelationPlace: entry.place
        )
    }

    // MARK: - Reciters

    static let reciters: [Reciter] = [
        Reciter(
            id: "dhikr-al-huda",
            name: "Dhikr Al-Huda",
            style: "Murattal",
            languageName: "Arabic",
            sampleURL: URL(string: "https://example.org/ezber/reciters/dhikr-al-huda/sample.mp3"),
            audioBaseURL: URL(string: "https://example.org/ezber/reciters/dhikr-al-huda/"),
            license: "CC BY 4.0 (placeholder URL; audio pipeline pending)"
        ),
        Reciter(
            id: "mishary-alafasy",
            name: "Mishary Rashid Alafasy",
            style: "Murattal",
            languageName: "Arabic",
            sampleURL: URL(string: "https://example.org/ezber/reciters/mishary-alafasy/sample.mp3"),
            audioBaseURL: URL(string: "https://example.org/ezber/reciters/mishary-alafasy/"),
            license: "Placeholder — rights pending"
        ),
        Reciter(
            id: "abdul-basit",
            name: "Abdul Basit Abdus Samad",
            style: "Mujawwad",
            languageName: "Arabic",
            sampleURL: URL(string: "https://example.org/ezber/reciters/abdul-basit/sample.mp3"),
            audioBaseURL: URL(string: "https://example.org/ezber/reciters/abdul-basit/"),
            license: "Placeholder — rights pending"
        )
    ]

    // MARK: - Seeded user data

    static let seededPresets: [Preset] = [
        Preset(
            name: "Ar-Rahman 1–5",
            surahID: 55,
            range: VerseRange(start: 1, end: 5),
            repeats: RepeatPlan(defaultRepeats: 5),
            reciterID: "dhikr-al-huda"
        ),
        Preset(
            name: "Al-Mulk evening",
            surahID: 67,
            range: VerseRange(start: 1, end: 5),
            repeats: RepeatPlan(defaultRepeats: 3),
            reciterID: "dhikr-al-huda"
        ),
        Preset(
            name: "Al-Fatihah warm-up",
            surahID: 1,
            range: VerseRange(start: 1, end: 7),
            repeats: RepeatPlan(defaultRepeats: 3),
            reciterID: "mishary-alafasy",
            display: DisplayOptions(showArabic: true)
        )
    ]

    static let seededProgress: [VerseProgress] = [
        VerseProgress(
            verseID: VerseID(surah: 55, number: 1),
            repetitionsCompleted: 12,
            exposureCount: 3,
            lastPlayedAt: Date().addingTimeInterval(-3_600),
            state: .review
        ),
        VerseProgress(
            verseID: VerseID(surah: 55, number: 2),
            repetitionsCompleted: 7,
            exposureCount: 2,
            lastPlayedAt: Date().addingTimeInterval(-3_500),
            state: .learning
        ),
        VerseProgress(
            verseID: VerseID(surah: 55, number: 3),
            repetitionsCompleted: 2,
            exposureCount: 1,
            lastPlayedAt: Date().addingTimeInterval(-3_400),
            state: .learning
        ),
        VerseProgress(
            verseID: VerseID(surah: 1, number: 1),
            repetitionsCompleted: 31,
            exposureCount: 8,
            lastPlayedAt: Date().addingTimeInterval(-86_400),
            state: .strong
        )
    ]

    static let seededNotes: [Note] = [
        Note(
            verseID: VerseID(surah: 55, number: 1),
            body: "Start low and let the first line settle before repeating.",
            kind: .text,
            createdAt: Date().addingTimeInterval(-7_200),
            updatedAt: Date().addingTimeInterval(-7_200)
        ),
        Note(
            verseID: VerseID(surah: 55, number: 4),
            body: "Watch the madd on \"al-bayan\".",
            kind: .voiceMemo,
            transcript: nil,
            isTranscribed: false,
            audioFileName: "memo-55-4.m4a",
            createdAt: Date().addingTimeInterval(-3_600),
            updatedAt: Date().addingTimeInterval(-3_600)
        )
    ]

    // MARK: - Generated verses

    /// A clearly fake verse used when the curated set does not cover a position.
    static func generatedVerse(surahID: Int, number: Int) -> Verse {
        Verse(
            surahID: surahID,
            number: number,
            arabic: "﴿ placeholder Arabic · \(surahID):\(number) ﴾",
            transliteration: "Placeholder transliteration for verse \(surahID):\(number). The content pipeline will replace this reading.",
            translations: [
                Translation(
                    id: "placeholder",
                    translator: "Placeholder",
                    languageCode: "en",
                    text: "Placeholder translation for verse \(surahID):\(number)."
                )
            ]
        )
    }

    // MARK: - Curated verses

    static let curatedVerses: [Verse] = [
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
        verse(114, 6, "مِنَ ٱلْجِنَّةِ وَٱلنَّاسِ", "Minal-jinnati wan-nas", "Of the jinn and of mankind")
    ]

    private static func verse(
        _ surah: Int,
        _ number: Int,
        _ arabic: String,
        _ transliteration: String,
        _ translation: String
    ) -> Verse {
        Verse(
            surahID: surah,
            number: number,
            arabic: arabic,
            transliteration: transliteration,
            translations: [
                Translation(
                    id: "pickthall",
                    translator: "M. M. Pickthall",
                    languageCode: "en",
                    text: translation
                )
            ]
        )
    }

    // MARK: - Surah table

    private static let surahTable: [(id: Int, arabic: String, latin: String, english: String, verses: Int, place: RevelationPlace)] = [
        (1, "الفاتحة", "Al-Fatihah", "The Opening", 7, .meccan),
        (2, "البقرة", "Al-Baqarah", "The Cow", 286, .medinan),
        (3, "آل عمران", "Ali 'Imran", "Family of Imran", 200, .medinan),
        (4, "النساء", "An-Nisa", "The Women", 176, .medinan),
        (5, "المائدة", "Al-Ma'idah", "The Table Spread", 120, .medinan),
        (6, "الأنعام", "Al-An'am", "The Cattle", 165, .meccan),
        (7, "الأعراف", "Al-A'raf", "The Heights", 206, .meccan),
        (8, "الأنفال", "Al-Anfal", "The Spoils of War", 75, .medinan),
        (9, "التوبة", "At-Tawbah", "The Repentance", 129, .medinan),
        (10, "يونس", "Yunus", "Jonah", 109, .meccan),
        (11, "هود", "Hud", "Hud", 123, .meccan),
        (12, "يوسف", "Yusuf", "Joseph", 111, .meccan),
        (13, "الرعد", "Ar-Ra'd", "The Thunder", 43, .medinan),
        (14, "إبراهيم", "Ibrahim", "Abraham", 52, .meccan),
        (15, "الحجر", "Al-Hijr", "The Rocky Tract", 99, .meccan),
        (16, "النحل", "An-Nahl", "The Bee", 128, .meccan),
        (17, "الإسراء", "Al-Isra", "The Night Journey", 111, .meccan),
        (18, "الكهف", "Al-Kahf", "The Cave", 110, .meccan),
        (19, "مريم", "Maryam", "Mary", 98, .meccan),
        (20, "طه", "Ta-Ha", "Ta-Ha", 135, .meccan),
        (21, "الأنبياء", "Al-Anbya", "The Prophets", 112, .meccan),
        (22, "الحج", "Al-Hajj", "The Pilgrimage", 78, .medinan),
        (23, "المؤمنون", "Al-Mu'minun", "The Believers", 118, .meccan),
        (24, "النور", "An-Nur", "The Light", 64, .medinan),
        (25, "الفرقان", "Al-Furqan", "The Criterion", 77, .meccan),
        (26, "الشعراء", "Ash-Shu'ara", "The Poets", 227, .meccan),
        (27, "النمل", "An-Naml", "The Ant", 93, .meccan),
        (28, "القصص", "Al-Qasas", "The Stories", 88, .meccan),
        (29, "العنكبوت", "Al-'Ankabut", "The Spider", 69, .meccan),
        (30, "الروم", "Ar-Rum", "The Romans", 60, .meccan),
        (31, "لقمان", "Luqman", "Luqman", 34, .meccan),
        (32, "السجدة", "As-Sajdah", "The Prostration", 30, .meccan),
        (33, "الأحزاب", "Al-Ahzab", "The Combined Forces", 73, .medinan),
        (34, "سبأ", "Saba", "Sheba", 54, .meccan),
        (35, "فاطر", "Fatir", "Originator", 45, .meccan),
        (36, "يس", "Ya-Sin", "Ya-Sin", 83, .meccan),
        (37, "الصافات", "As-Saffat", "Those Who Set The Ranks", 182, .meccan),
        (38, "ص", "Sad", "Sad", 88, .meccan),
        (39, "الزمر", "Az-Zumar", "The Troops", 75, .meccan),
        (40, "غافر", "Ghafir", "The Forgiver", 85, .meccan),
        (41, "فصلت", "Fussilat", "Explained in Detail", 54, .meccan),
        (42, "الشورى", "Ash-Shuraa", "The Consultation", 53, .meccan),
        (43, "الزخرف", "Az-Zukhruf", "The Ornaments of Gold", 89, .meccan),
        (44, "الدخان", "Ad-Dukhan", "The Smoke", 59, .meccan),
        (45, "الجاثية", "Al-Jathiyah", "The Crouching", 37, .meccan),
        (46, "الأحقاف", "Al-Ahqaf", "The Wind-Curved Sandhills", 35, .meccan),
        (47, "محمد", "Muhammad", "Muhammad", 38, .medinan),
        (48, "الفتح", "Al-Fath", "The Victory", 29, .medinan),
        (49, "الحجرات", "Al-Hujurat", "The Rooms", 18, .medinan),
        (50, "ق", "Qaf", "Qaf", 45, .meccan),
        (51, "الذاريات", "Adh-Dhariyat", "The Winnowing Winds", 60, .meccan),
        (52, "الطور", "At-Tur", "The Mount", 49, .meccan),
        (53, "النجم", "An-Najm", "The Star", 62, .meccan),
        (54, "القمر", "Al-Qamar", "The Moon", 55, .meccan),
        (55, "الرحمن", "Ar-Rahman", "The Beneficent", 78, .medinan),
        (56, "الواقعة", "Al-Waqi'ah", "The Inevitable", 96, .meccan),
        (57, "الحديد", "Al-Hadid", "The Iron", 29, .medinan),
        (58, "المجادلة", "Al-Mujadila", "The Pleading Woman", 22, .medinan),
        (59, "الحشر", "Al-Hashr", "The Exile", 24, .medinan),
        (60, "الممتحنة", "Al-Mumtahanah", "She That Is To Be Examined", 13, .medinan),
        (61, "الصف", "As-Saf", "The Ranks", 14, .medinan),
        (62, "الجمعة", "Al-Jumu'ah", "The Congregation", 11, .medinan),
        (63, "المنافقون", "Al-Munafiqun", "The Hypocrites", 11, .medinan),
        (64, "التغابن", "At-Taghabun", "The Mutual Disillusion", 18, .medinan),
        (65, "الطلاق", "At-Talaq", "The Divorce", 12, .medinan),
        (66, "التحريم", "At-Tahrim", "The Prohibition", 12, .medinan),
        (67, "الملك", "Al-Mulk", "The Sovereignty", 30, .meccan),
        (68, "القلم", "Al-Qalam", "The Pen", 52, .meccan),
        (69, "الحاقة", "Al-Haqqah", "The Reality", 52, .meccan),
        (70, "المعارج", "Al-Ma'arij", "The Ascending Stairways", 44, .meccan),
        (71, "نوح", "Nuh", "Noah", 28, .meccan),
        (72, "الجن", "Al-Jinn", "The Jinn", 28, .meccan),
        (73, "المزمل", "Al-Muzzammil", "The Enshrouded One", 20, .meccan),
        (74, "المدثر", "Al-Muddaththir", "The Cloaked One", 56, .meccan),
        (75, "القيامة", "Al-Qiyamah", "The Resurrection", 40, .meccan),
        (76, "الإنسان", "Al-Insan", "The Man", 31, .medinan),
        (77, "المرسلات", "Al-Mursalat", "The Emissaries", 50, .meccan),
        (78, "النبأ", "An-Naba", "The Tidings", 40, .meccan),
        (79, "النازعات", "An-Nazi'at", "Those Who Drag Forth", 46, .meccan),
        (80, "عبس", "'Abasa", "He Frowned", 42, .meccan),
        (81, "التكوير", "At-Takwir", "The Overthrowing", 29, .meccan),
        (82, "الانفطار", "Al-Infitar", "The Cleaving", 19, .meccan),
        (83, "المطففين", "Al-Mutaffifin", "The Defrauding", 36, .meccan),
        (84, "الانشقاق", "Al-Inshiqaq", "The Sundering", 25, .meccan),
        (85, "البروج", "Al-Buruj", "The Mansions of the Stars", 22, .meccan),
        (86, "الطارق", "At-Tariq", "The Morning Star", 17, .meccan),
        (87, "الأعلى", "Al-A'la", "The Most High", 19, .meccan),
        (88, "الغاشية", "Al-Ghashiyah", "The Overwhelming", 26, .meccan),
        (89, "الفجر", "Al-Fajr", "The Dawn", 30, .meccan),
        (90, "البلد", "Al-Balad", "The City", 20, .meccan),
        (91, "الشمس", "Ash-Shams", "The Sun", 15, .meccan),
        (92, "الليل", "Al-Layl", "The Night", 21, .meccan),
        (93, "الضحى", "Ad-Duhaa", "The Morning Hours", 11, .meccan),
        (94, "الشرح", "Ash-Sharh", "The Relief", 8, .meccan),
        (95, "التين", "At-Tin", "The Fig", 8, .meccan),
        (96, "العلق", "Al-'Alaq", "The Clot", 19, .meccan),
        (97, "القدر", "Al-Qadr", "The Power", 5, .meccan),
        (98, "البينة", "Al-Bayyinah", "The Clear Proof", 8, .medinan),
        (99, "الزلزلة", "Az-Zalzalah", "The Earthquake", 8, .medinan),
        (100, "العاديات", "Al-'Adiyat", "The Courser", 11, .meccan),
        (101, "القارعة", "Al-Qari'ah", "The Calamity", 11, .meccan),
        (102, "التكاثر", "At-Takathur", "The Rivalry in World Increase", 8, .meccan),
        (103, "العصر", "Al-'Asr", "The Declining Day", 3, .meccan),
        (104, "الهمزة", "Al-Humazah", "The Traducer", 9, .meccan),
        (105, "الفيل", "Al-Fil", "The Elephant", 5, .meccan),
        (106, "قريش", "Quraysh", "Quraysh", 4, .meccan),
        (107, "الماعون", "Al-Ma'un", "The Small Kindnesses", 7, .meccan),
        (108, "الكوثر", "Al-Kawthar", "The Abundance", 3, .meccan),
        (109, "الكافرون", "Al-Kafirun", "The Disbelievers", 6, .meccan),
        (110, "النصر", "An-Nasr", "The Divine Support", 3, .medinan),
        (111, "المسد", "Al-Masad", "The Palm Fibre", 5, .meccan),
        (112, "الإخلاص", "Al-Ikhlas", "The Sincerity", 4, .meccan),
        (113, "الفلق", "Al-Falaq", "The Daybreak", 5, .meccan),
        (114, "الناس", "An-Nas", "Mankind", 6, .meccan)
    ]
}
