// Russian interface. The app is written in English; this module translates what ends up on the
// page: text nodes plus placeholder / title / aria-label, including everything rendered later
// (toasts, dialogs, menus) via a MutationObserver. User content (messages, answers, chat names,
// inputs) is never touched.

const LANG_KEY = "veora_lang";

function detect() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (saved === "ru" || saved === "en") return saved;
  } catch { /* ignore */ }
  return (navigator.language || "en").toLowerCase().startsWith("ru") ? "ru" : "en";
}

export const lang = detect();

export function setLang(next) {
  try { localStorage.setItem(LANG_KEY, next); } catch { /* ignore */ }
  location.reload();
}

// 1 кредит / 2 кредита / 5 кредитов
function plural(n, one, few, many) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b === 1) return one;
  if (b >= 2 && b <= 4) return few;
  return many;
}

const RU = {
  // ---------- landing ----------
  "Features": "Возможности", "Models": "Модели", "Plans": "Тарифы", "FAQ": "Вопросы",
  "Log in": "Войти", "Sign up": "Регистрация",

  "Chat with GPT, Claude, Gemini, Llama and dozens more. Generate images, videos and lifelike speech — all in one beautifully simple place.":
    "Общайтесь с GPT, Claude, Gemini, Llama и десятками других моделей. Создавайте картинки, видео и живую речь — всё в одном простом и красивом месте.",
  "Get started — it's free": "Начать бесплатно", "I have an account": "У меня есть аккаунт",
  "No credit card. 25 free credits every day.": "Без карты. 25 бесплатных кредитов каждый день.",
  "AI models": "ИИ-моделей", "AI labs": "ИИ-лабораторий",
  "Modalities: text, image, video, voice": "Форматы: текст, картинки, видео, голос",
  "Subscription for everything": "Подписка на всё",
  "Everything you'd want from AI.": "Всё, что нужно от ИИ.", "Nothing you'd have to juggle.": "И ничего лишнего.",
  "The world's best models,": "Лучшие модели мира —", "side by side.": "в одном месте.",
  "New models land in Veora as soon as they're out. Pick one yourself or let Auto decide.":
    "Новые модели появляются в Veora сразу после выхода. Выбирайте сами или доверьтесь режиму Auto.",
  "How it works": "Как это работает", "From sign-up to answer in a minute.": "От регистрации до ответа — за минуту.",
  "Sign up with email": "Регистрация по почте",
  "Enter your email, type the 6-digit code. No passwords to remember.": "Введите почту и 6-значный код. Никаких паролей.",
  "Pick a model — or Auto": "Выберите модель — или Auto",
  "Chat, create, listen": "Общайтесь, создавайте, слушайте",
  "Ask questions, send photos, generate images, videos and speech.": "Задавайте вопросы, отправляйте фото, создавайте картинки, видео и речь.",
  "Start free. Upgrade when you're ready.": "Начните бесплатно. Переходите на тариф, когда будете готовы.",
  "Credits refill every day; Pro requests and videos every month. Every paid plan unlocks all 30+ models.":
    "Кредиты пополняются каждый день, Pro-запросы и видео — каждый месяц. Любой платный тариф открывает все 30+ моделей.",
  "Start free": "Начать бесплатно", "credits / day": "кредитов в день", "Pro requests / month": "Pro-запросов в месяц",
  "Vision & encrypted history": "Распознавание фото и шифрование истории", "Images & voice": "Картинки и озвучка",
  "Billed monthly through Stripe. Cancel anytime.": "Оплата ежемесячно через Stripe. Отменить можно в любой момент.",
  "Questions, answered.": "Ответы на вопросы.",

  "Join Veora and get 25 free credits every day.": "Присоединяйтесь к Veora и получайте 25 бесплатных кредитов каждый день.",
  "Create free account": "Создать аккаунт бесплатно",
  "Most popular": "Популярный", "Popular": "Популярный",
  "Unlock every model": "Все модели", "For everyday chats": "Для ежедневных задач", "Add video & voices": "Видео и свои голоса",
  "For power users": "Для активных", "For heavy creators": "Для авторов", "No compromises": "Без компромиссов",
  "Every top model": "Все топовые модели",
  "GPT, Claude, Gemini, Llama, Mistral, Qwen and more — switch in one tap, mid-conversation.":
    "GPT, Claude, Gemini, Llama, Mistral, Qwen и другие — переключайтесь в одно касание прямо в диалоге.",
  "Auto mode": "Режим Auto",
  "Not sure which model to use? Veora picks the best one for every request.": "Не знаете, какую модель выбрать? Veora подберёт лучшую для каждого запроса.",
  "Vision": "Зрение", "Attach up to five photos and ask anything about them.": "Прикрепите до пяти фото и спросите о них что угодно.",
  "Image generation": "Генерация картинок", "Create images from a sentence with Gemini image models.": "Создавайте картинки по описанию с моделями Gemini.",
  "Video generation": "Генерация видео", "Turn ideas into short clips with Google Veo 3.1.": "Превращайте идеи в короткие ролики с Google Veo 3.1.",
  "Voice studio": "Студия озвучки",
  "Lifelike speech in Russian, English and more — six voices, three models.": "Живая речь на русском, английском и других языках — шесть голосов, три модели.",
  "Custom GPTs": "Свои GPT", "Build your own assistants with custom instructions.": "Создавайте своих ассистентов со своими инструкциями.",
  "Memory": "Память", "Veora remembers what matters about you, so answers get more personal.": "Veora запоминает важное о вас, и ответы становятся персональнее.",
  "Folders & pins": "Папки и закрепление",
  "Keep chats organized with folders, tags and pinned threads — drag and drop included.": "Держите чаты в порядке: папки, теги, закреплённые диалоги и перетаскивание.",
  "Encrypted history": "Зашифрованная история",
  "Messages are encrypted before they're stored. Delete any chat — with its images — whenever you want.":
    "Сообщения шифруются перед сохранением. Удаляйте любой чат вместе с картинками в любой момент.",
  "Share chats": "Делитесь чатами", "Send a link to any conversation in one click.": "Отправьте ссылку на любой диалог в один клик.",
  "Any device": "Любое устройство", "Works in any browser — on your laptop, tablet or phone. Your chats follow you.": "Работает в любом браузере — на ноутбуке, планшете или телефоне. Чаты всегда с вами.",
  "Is there a free plan?": "Есть ли бесплатный тариф?",
  "Yes. Every account gets 25 credits a day with fast models like GPT-6 Luna, Llama 4, Gemma and Mistral. Any paid plan unlocks all 30+ models, images, video and voice.":
    "Да. Каждый аккаунт получает 25 кредитов в день на быстрые модели — GPT-6 Luna, Llama 4, Gemma и Mistral. Любой платный тариф открывает все 30+ моделей, картинки, видео и голос.",
  "What are credits?": "Что такое кредиты?",
  "Your daily allowance. Fast models cost 1 credit per message; stronger ones cost a little more — for example Gemini 3 Flash 4 and GPT-5.4 mini 5. The cost is shown next to every model.":
    "Это ваш дневной лимит. Быстрые модели стоят 1 кредит за сообщение, более мощные — чуть больше: например, Gemini 3 Flash — 4, GPT-5.4 mini — 5. Цена указана рядом с каждой моделью.",
  "What is a Pro request?": "Что такое Pro-запрос?",
  "Top-tier models like Claude Opus and Sonnet, GPT-4o and Mistral Large — plus image and voice generation — use monthly Pro requests. Videos have their own monthly credits.":
    "Топовые модели — Claude Opus и Sonnet, GPT-4o, Mistral Large — а также генерация картинок и озвучка тратят месячные Pro-запросы. У видео — свои месячные кредиты.",
  "When do they refill?": "Когда они пополняются?",
  "Credits refill every day; Pro requests and videos every month — automatically, up to your plan's limit.":
    "Кредиты — каждый день, Pro-запросы и видео — каждый месяц, автоматически до лимита вашего тарифа.",
  "Where do I subscribe?": "Где оформить подписку?",
  "Right here on the site: open your account and pick a plan. Payments go through Stripe, and you can cancel anytime.":
    "Прямо на сайте: откройте аккаунт и выберите тариф. Оплата через Stripe, отменить можно в любой момент.",
  "Is my chat history private?": "Моя история переписки защищена?",
  "Messages are encrypted before they're saved to our database, and you can delete any chat — including its images — at any time.":
    "Сообщения шифруются перед сохранением в базу, и вы можете удалить любой чат вместе с картинками в любой момент.",
  "Do I need a password?": "Нужен ли пароль?",
  "No. Sign in with Google or with a one-time code sent to your email. Sign in with Apple is coming to the web soon.":
    "Нет. Войдите через Google или по одноразовому коду из письма. Вход через Apple скоро появится и на сайте.",

  // ---------- auth ----------
  "Welcome back": "С возвращением", "Create your account": "Создайте аккаунт",
  "Sign in to continue to your chats.": "Войдите, чтобы продолжить общение.",
  "Get 25 free credits every day with fast models — upgrade anytime for all 30+ models from OpenAI, Anthropic, Google and more.":
    "25 бесплатных кредитов каждый день на быстрые модели — а с тарифом все 30+ моделей от OpenAI, Anthropic, Google и других.",
  "Continue with Google": "Продолжить с Google", "Continue with Apple": "Продолжить с Apple", "Continue with email": "Продолжить по почте",
  "or": "или", "Email": "Почта", "Code": "Код", "Sign in": "Войти", "Sending code…": "Отправляем код…", "Signing in…": "Входим…",
  "Check your email": "Проверьте почту", "We sent a 6-digit code to": "Мы отправили 6-значный код на",
  "Use a different email": "Другая почта", "Already have an account?": "Уже есть аккаунт?", "New to Veora?": "Впервые в Veora?",
  "Create an account": "Создать аккаунт", "← Back to home": "← На главную",
  "Coming soon. Sign in with email for now.": "Скоро. Пока войдите по почте.",
  "Google sign-in is still loading. Try again in a second.": "Вход через Google ещё загружается. Попробуйте через секунду.",
  "Google sign-in isn't configured yet. Sign in with email for now.": "Вход через Google пока не настроен. Войдите по почте.",
  "Couldn't load Google sign-in. Check your connection or ad blocker.": "Не удалось загрузить вход через Google. Проверьте интернет или блокировщик рекламы.",

  // ---------- chat & sidebar ----------
  "New chat": "Новый чат", "Folders": "Папки", "Chats": "Чаты", "New folder": "Новая папка",
  "Group chats into folders": "Объединяйте чаты в папки", "No chats yet": "Чатов пока нет", "All chats are in folders": "Все чаты в папках",
  "Drag chats here": "Перетащите чаты сюда", "Chat options": "Действия с чатом", "Folder options": "Действия с папкой",
  "Rename": "Переименовать", "Pin": "Закрепить", "Unpin": "Открепить", "Move to folder…": "Переместить в папку…", "Delete": "Удалить",
  "Tags…": "Теги…", "Delete folder": "Удалить папку", "Rename chat": "Переименовать чат", "Rename folder": "Переименовать папку",
  "Delete chat?": "Удалить чат?", "Delete folder?": "Удалить папку?",
  "This chat and all its messages and images will be permanently deleted.": "Чат со всеми сообщениями и картинками будет удалён навсегда.",
  "Move to folder": "Переместить в папку", "Remove from folder": "Убрать из папки", "New folder name": "Название новой папки",
  "Create": "Создать", "Folder name": "Название папки", "Add a tag and press Enter": "Введите тег и нажмите Enter", "Add": "Добавить",
  "No tags yet.": "Тегов пока нет.", "Save": "Сохранить", "Cancel": "Отмена", "Close": "Закрыть",
  "Open menu": "Открыть меню", "Close menu": "Закрыть меню", "Open sidebar": "Открыть панель", "Close sidebar": "Скрыть панель",
  "Open sidebar (⌘⇧S)": "Открыть панель (⌘⇧S)", "Close sidebar (⌘⇧S)": "Скрыть панель (⌘⇧S)",
  "Message Veora…": "Сообщение для Veora…", "Message": "Сообщение", "Attach images": "Прикрепить фото", "Send": "Отправить",
  "Remove image": "Убрать фото", "Dictate": "Диктовать", "Dictate a message": "Надиктовать сообщение",
  "Cancel recording": "Отменить запись", "Finish and transcribe": "Готово — распознать", "Transcribing…": "Распознаём…",
  "Pick a model at the top or leave it on Auto — Veora will choose the best one for your request.":
    "Выберите модель сверху или оставьте Auto — Veora подберёт лучшую для вашего запроса.",
  "How can I help?": "Чем могу помочь?",
  "Explain quantum computing like I'm 12": "Объясни квантовые компьютеры как 12-летнему",
  "Write a Python script that renames files by date": "Напиши скрипт на Python, который переименует файлы по дате",
  "Plan a 3-day trip to Tokyo on a budget": "Спланируй бюджетную поездку в Токио на 3 дня",
  "Help me write a friendly follow-up email": "Помоги написать дружелюбное письмо-напоминание",
  "Thinking": "Думаю", "Looking at your images": "Смотрю на фото", "Creating your image": "Создаю картинку", "Starting your video": "Запускаю видео",
  "Copy": "Копировать", "Copied": "Скопировано", "Copy code": "Скопировать код", "Show original": "Показать оригинал",
  "Translating…": "Переводим…", "Choose translation language": "Язык перевода",
  "Generating your video": "Создаём видео", "Usually takes 1–3 minutes. You can keep chatting — it will appear here.":
    "Обычно 1–3 минуты. Можно продолжать общение — видео появится здесь.",
  "The video couldn't be generated. Your video credit was refunded — please try again.": "Не удалось создать видео. Кредит возвращён — попробуйте ещё раз.",
  "The video couldn't be generated. Your video credit was refunded — please try again.": "Не удалось создать видео. Кредит возвращён — попробуйте ещё раз.",
  "This chat is not available.": "Этот чат недоступен.", "Account not found. Try signing in again.": "Аккаунт не найден. Войдите заново.",
  "Empty response from server.": "Пустой ответ сервера.", "Unexpected response from server.": "Неожиданный ответ сервера.",
  "Loading your chats…": "Загружаем ваши чаты…", "Loading messages": "Загрузка сообщений", "Loading…": "Загрузка…",
  "Describe the video you want — attach a photo to animate it…": "Опишите видео — или прикрепите фото, чтобы оживить его…",
  "Text to read aloud…": "Текст для озвучки…", "Voice clone": "Свой голос", "Voice": "Голос",
  "Free plan: 1 photo per message. Upgrade to send up to 5.": "Бесплатно — 1 фото в сообщении. С тарифом — до 5.",
  "This model is included with every paid plan.": "Эта модель доступна в любом платном тарифе.",
  "Generated image": "Сгенерированная картинка", "Attached image": "Прикреплённое фото",
  "Play": "Воспроизвести", "Pause": "Пауза", "Seek": "Перемотка", "Playback speed": "Скорость", "Download": "Скачать",
  "Unavailable": "Недоступно",

  // ---------- model picker ----------
  "Search models": "Поиск моделей", "Recommended": "Рекомендуем", "No models found": "Модели не найдены",
  "Picks the best model for each request": "Подбирает лучшую модель для каждого запроса",
  "Reads your text aloud": "Озвучивает ваш текст", "8-second clips with sound · uses video credits": "Ролики 8 секунд со звуком · тратит видео-кредиты",
  "Premium": "Премиум", "Image": "Картинки", "Video": "Видео", "Reasoning": "Рассуждения", "Other": "Другие",

  // ---------- profile / appearance / billing ----------
  "Account": "Аккаунт", "Plan": "Тариф", "Credits today": "Кредиты сегодня", "Pro requests / month": "Pro-запросов в месяц",
  "Videos / month": "Видео в месяц", "Streak": "Серия дней", "Translation is temporarily unavailable": "Перевод временно недоступен, попробуйте чуть позже", "Text is too long to translate": "Текст слишком длинный для перевода", "Nothing to translate": "Нечего переводить", "Precise answers, reads images": "Точные ответы, понимает картинки", "Newest GPT: code, documents, hard tasks": "Новейший GPT: код, документы, сложные задачи", "Newest GPT, fast and free": "Новейший GPT, быстрый и бесплатный", "Your plan": "Ваш тариф", "Active": "Активна", "Ends soon": "Закончится", "Payment card": "Карта для оплаты", "Renews every 30 days": "Продлевается каждые 30 дней", "Off — no saved card": "Выкл — нет сохранённой карты", "Pick a plan to unlock every model, the studios and more requests.": "Выберите тариф, чтобы открыть все модели, студии и больше запросов.", "Choose a plan": "Выбрать тариф", "You can turn auto-renewal off at any time: the plan stays until the end of the paid period.": "Автопродление можно отключить в любой момент — тариф сохранится до конца оплаченного периода.", "When the paid period ends, your account switches to the Free plan. Nothing will be charged.": "Когда оплаченный период закончится, аккаунт перейдёт на бесплатный тариф. Списаний не будет.", "Unlink card": "Отвязать карту", "Unlink card?": "Отвязать карту?", "Unlink": "Отвязать", "Card unlinked": "Карта отвязана", "Not linked": "Не привязана", "Linked": "Привязана", "No linked card": "Карта не привязана", "Opening payment…": "Открываем оплату…", "Checking your payment…": "Проверяем оплату…", "We couldn't confirm the payment yet. If you paid, the plan will appear in a minute; if you closed the payment page, nothing was charged.": "Пока не удалось подтвердить оплату. Если вы оплатили, тариф появится через минуту; если закрыли страницу оплаты — деньги не списаны.", "Subscription": "Подписка", "Next charge": "Следующее списание", "Active until": "Действует до", "Card": "Карта", "Auto-renewal": "Автопродление", "On": "Вкл", "Off": "Выкл", "Turn off auto-renewal": "Отключить автопродление", "Turn auto-renewal back on": "Включить автопродление", "Turn off auto-renewal?": "Отключить автопродление?", "Auto-renewal is off": "Автопродление отключено", "Auto-renewal is on": "Автопродление включено", "The plan renews every 30 days. You can turn auto-renewal off at any time: the plan stays until the end of the paid period.": "Тариф продлевается каждые 30 дней. Автопродление можно отключить в любой момент — тариф сохранится до конца оплаченного периода.", "Auto-renewal is off. When the paid period ends, your account switches to the Free plan.": "Автопродление отключено. Когда оплаченный период закончится, аккаунт перейдёт на бесплатный тариф.", "Unknown plan": "Неизвестный тариф", "Already subscribed": "У вас уже есть тариф", "Payment service is unavailable": "Платёжный сервис недоступен, попробуйте позже", "No active subscription": "Нет активной подписки", "Auto-renewal can't be turned on": "Не удалось включить автопродление", "Photo studio": "Фото-студия", "Create and edit images with the best models": "Создавайте и редактируйте картинки лучшими моделями", "Image prompt": "Описание картинки", "Describe the image: subject, style, lighting, colors, camera…": "Опишите картинку: что на ней, стиль, свет, цвета, ракурс…", "Reference photos": "Фото-референсы", "Add photo": "Добавить фото", "Remove photo": "Убрать фото", "Add photos to edit them, or to keep a face, product or style in the new image.": "Добавьте фото, чтобы отредактировать их или сохранить лицо, товар или стиль на новой картинке.", "Quality": "Качество", "Standard": "Стандарт", "High": "Высокое", "Variants": "Варианты", "Unlock images": "Открыть картинки", "Create image": "Создать картинку", "Not enough Pro requests. Try fewer variants or Standard quality.": "Не хватает Pro-запросов. Выберите меньше вариантов или стандартное качество.", "Not enough Pro requests for this image.": "Не хватает Pro-запросов для этой картинки.", "Use as reference": "Взять как референс", "Couldn't load this image. Download it and add it as a photo.": "Не удалось загрузить картинку. Скачайте её и добавьте как фото.", "The image couldn't be generated. Please try again.": "Не удалось создать картинку. Попробуйте ещё раз.", "Pro requests were refunded.": "Pro-запросы возвращены.", "Delete images?": "Удалить картинки?", "They will be removed from your photo studio.": "Они пропадут из вашей фото-студии.", "Create your first image": "Создайте первую картинку", "Describe a picture or add a photo to edit, pick a model and press Create.": "Опишите картинку или добавьте фото для правки, выберите модель и нажмите «Создать».", "Best quality, understands complex scenes": "Лучшее качество, понимает сложные сцены", "Fast, great at editing photos": "Быстрая, отлично редактирует фото", "Cheapest and fastest": "Самая дешёвая и быстрая", "Vivid images and posters": "Яркие картинки и постеры", "Clean text and lettering": "Чёткий текст и надписи", "Unknown image model": "Неизвестная модель картинок", "Describe the image": "Опишите картинку", "Unsupported image settings": "Эти настройки не поддерживаются", "Too many photos": "Слишком много фото", "Image not found": "Картинка не найдена", "The image is still being generated": "Картинка ещё создаётся", "A cozy reading nook by a rainy window, warm lamp light, photorealistic": "Уютный уголок для чтения у дождливого окна, тёплый свет лампы, фотореализм", "Minimal logo of a fox made of geometric shapes, orange on white": "Минималистичный логотип лисы из геометрических фигур, оранжевый на белом", "Portrait of an astronaut cat, studio lighting, 85mm photo": "Портрет кота-астронавта, студийный свет, фото на 85 мм", "Poster for a summer jazz festival with bold lettering 'JAZZ NIGHTS'": "Постер летнего джазового фестиваля с крупной надписью «JAZZ NIGHTS»", "Google quality with sound, great value": "Качество Google со звуком, выгодно", "Lifelike motion, animates photos of people": "Реалистичное движение, оживляет фото людей", "Long clips up to 15 s, up to 1080p": "Длинные ролики до 15 с, до 1080p", "Fastest and cheapest, for quick ideas": "Самая быстрая и дешёвая, для быстрых идей", "Cheapest and fastest images": "Самые быстрые и дешёвые картинки", "Photorealism and precise edits": "Фотореализм и точная правка", "Top-tier detail and style": "Максимум деталей и стиля", "Vivid images, posters and edits": "Яркие картинки, постеры и правка", "Bold, creative images": "Смелые креативные картинки", "Clean text and lettering in images": "Чёткий текст и надписи на картинках", "Logos, icons and design": "Логотипы, иконки и дизайн", "Google quality with sound": "Качество Google со звуком", "Lifelike motion, animates people": "Реалистичное движение, оживляет людей", "Long clips, up to 1080p": "Длинные ролики, до 1080p", "Fastest and cheapest clips": "Самые быстрые и дешёвые ролики", "Music": "Музыка", "Music studio": "Музыкальная студия", "Turn an idea into a song": "Превратите идею в песню", "Music prompt": "Описание музыки", "Describe the song: what it's about, tempo, instruments, the voice…": "Опишите песню: о чём она, темп, инструменты, голос…", "Lyrics": "Текст песни", "Your own lyrics (optional). Leave empty and the model writes them.": "Свой текст песни (необязательно). Оставьте пустым — модель напишет сама.", "Genre": "Жанр", "Mood": "Настроение", "Vocals": "Вокал", "A singer performs the lyrics": "Текст исполняет вокалист", "Instrumental, no voice": "Инструментал, без голоса", "Unlock music": "Открыть музыку", "Create music": "Создать музыку", "Composing…": "Сочиняем…", "Usually under a minute": "Обычно меньше минуты", "The track couldn't be generated. Please try again.": "Не удалось создать трек. Попробуйте ещё раз.", "The song sounded too close to existing music. Remove artist or song names and try again.": "Трек получился слишком похожим на существующую музыку. Уберите названия песен и исполнителей и попробуйте ещё раз.", "Blocked by the model's safety filter. Try rephrasing the prompt or the lyrics.": "Заблокировано фильтром безопасности модели. Переформулируйте описание или текст.", "Your Pro request was refunded.": "Pro-запрос возвращён.", "Instrumental": "Инструментал", "With vocals": "С вокалом", "Show lyrics": "Показать текст", "Hide lyrics": "Скрыть текст", "Use this prompt": "Использовать это описание", "Delete track": "Удалить трек", "Delete track?": "Удалить трек?", "It will be removed from your music studio.": "Он пропадёт из вашей музыкальной студии.", "Create your first song": "Создайте первую песню", "Describe the mood and the story, pick a genre and press Create.": "Опишите настроение и историю, выберите жанр и нажмите «Создать».", "Your track is ready": "Трек готов", "Not enough Pro requests for this track.": "Не хватает Pro-запросов для этого трека.", "30-second music clips": "Музыкальные фрагменты по 30 секунд", "Full songs with vocals": "Полноценные песни с вокалом", "30-second clips, quick ideas": "Фрагменты по 30 секунд для быстрых идей", "Unknown music model": "Неизвестная музыкальная модель", "Describe the music": "Опишите музыку", "No Pro requests left": "Pro-запросы закончились", "Track not found": "Трек не найден", "The track is still being generated": "Трек ещё создаётся", "Untitled": "Без названия", "Upbeat summer pop song about a road trip with friends": "Весёлая летняя поп-песня о поездке с друзьями", "Calm lo-fi beat for studying, soft piano and vinyl crackle": "Спокойный lo-fi бит для учёбы, мягкое пианино и треск винила", "Epic cinematic orchestral theme for a movie trailer": "Эпичная оркестровая тема для трейлера фильма", "Warm acoustic love song with gentle guitar": "Тёплая акустическая песня о любви с нежной гитарой", "Pop": "Поп", "Rock": "Рок", "Hip-hop": "Хип-хоп", "Electronic": "Электроника", "Lo-fi": "Lo-fi", "Jazz": "Джаз", "Classical": "Классика", "Cinematic": "Кино", "Ambient": "Эмбиент", "R&B": "R&B", "Happy": "Радостное", "Calm": "Спокойное", "Energetic": "Энергичное", "Sad": "Грустное", "Epic": "Эпичное", "Romantic": "Романтичное", "Free models": "Бесплатные", "Paid models": "Платные", "Reset filters": "Сбросить фильтры", "Type": "Тип", "Company": "Компания", "Any task": "Любые задачи", "Free": "Бесплатно", "Smart all-rounder for any task": "Умная универсальная модель для любых задач", "Reliable writing and analysis": "Надёжные тексты и анализ", "Quick everyday answers": "Быстрые ответы на каждый день", "Deepest reasoning and long texts": "Самые глубокие рассуждения и длинные тексты", "Best for code and writing": "Лучшая для кода и текстов", "Fast and smart, reads photos": "Быстрая и умная, понимает фото", "Balanced speed and quality": "Баланс скорости и качества", "Very fast short answers": "Очень быстрые короткие ответы", "Fast answers, good with photos": "Быстрые ответы, хорошо работает с фото", "Tiny and instant": "Маленькая и мгновенная", "Light everyday chat": "Лёгкий чат на каждый день", "Open model, solid quality": "Открытая модель хорошего качества", "Efficient open model": "Экономичная открытая модель", "Strongest open Gemma": "Самая сильная открытая Gemma", "Reads documents and images": "Читает документы и изображения", "Light model that sees images": "Лёгкая модель, понимает картинки", "Thinks step by step": "Рассуждает по шагам", "Images, charts and screenshots": "Картинки, графики и скриншоты", "Math and logic, step by step": "Математика и логика по шагам", "Creative writing and chat": "Творческие тексты и общение", "Fast, handles long texts": "Быстрая, справляется с длинными текстами", "Precise, detailed answers": "Точные и подробные ответы", "Fast and compact": "Быстрая и компактная", "Lightweight, sees images": "Лёгкая, понимает картинки", "Quick answers from ByteDance": "Быстрые ответы от ByteDance", "Understands app screenshots": "Понимает скриншоты приложений", "Vision and reasoning": "Зрение и рассуждения", "Long documents and agents": "Длинные документы и агенты", "Highest-quality images": "Изображения высшего качества", "Fast image generation and edits": "Быстрая генерация и правка изображений", "Video clips with sound": "Видеоролики со звуком", "Cheaper draft videos": "Недорогие черновые видео", "Depends on the model it picks": "Зависит от выбранной модели", "Uses video credits": "Тратит видео-кредиты", "Uses Pro requests": "Тратит Pro-запросы", "Pro requests": "Pro-запросы", "With subscription": "С подпиской", "Chat": "Чат", "Photo": "Фото", "New name is too short or too long": "Имя слишком короткое или слишком длинное", "Prices in rubles for 30 days. Cancel anytime.": "Цены в рублях за 30 дней. Отменить можно в любой момент.", "Online payment is coming very soon": "Онлайн-оплата появится совсем скоро", "We're connecting payment by Russian cards and SBP. Subscriptions will open in the next few days.": "Мы подключаем оплату российскими картами и через СБП. Оформить подписку можно будет в ближайшие дни.", "Online payment is coming very soon. Subscriptions will open in the next few days.": "Онлайн-оплата появится совсем скоро. Оформить подписку можно будет в ближайшие дни.", "Coming soon": "Скоро", "If you miss a day, you can bring your streak back.": "Если пропустите день, серию можно будет вернуть.", "No restores left": "Восстановления закончились", "Public offer": "Договор-оферта", "Privacy policy": "Политика конфиденциальности", "Refund policy": "Условия возврата", "Documents": "Документы", "Contact email": "Почта для связи", "Contact us": "Связаться с нами", "Legal": "Правовая информация", "Seller details": "Реквизиты", "Seller": "Продавец", "Legal address": "Юридический адрес", "OGRNIP": "ОГРНИП", "INN": "ИНН", "Bank account": "Расчётный счёт", "Bank": "Банк", "Bank address": "Адрес банка", "BIC": "БИК", "Correspondent account": "Корр. счёт", "Share chat": "Поделиться чатом", "Share…": "Поделиться…", "Share link": "Ссылка", "Copy link": "Скопировать ссылку", "Stop sharing": "Закрыть доступ", "Creating link…": "Создаём ссылку…", "Read-only link": "Ссылка только для чтения", "Anyone with the link and a Veora account can read this chat, but can't write in it. Messages you add later will be visible too.": "Любой, у кого есть ссылка и аккаунт Veora, сможет прочитать этот чат, но не сможет в нём писать. Новые сообщения тоже будут видны.", "Couldn't turn off the link. Try again later.": "Не удалось закрыть доступ. Попробуйте позже.", "Link turned off. It no longer opens the chat.": "Доступ закрыт. Ссылка больше не открывает чат.", "Couldn't create a link for this chat.": "Не удалось создать ссылку для этого чата.", "Done": "Готово", "Read only": "Только чтение", "Open my chats": "Мои чаты", "Go to Veora": "Перейти в Veora", "Link not found": "Ссылка не найдена", "This link was turned off or never existed. Ask the person who sent it for a new one.": "Ссылку отключили, или её не существовало. Попросите у отправителя новую.", "Nothing to show": "Здесь пусто", "This chat is empty or was deleted by its owner.": "Чат пустой или удалён владельцем.", "Couldn't open the chat": "Не удалось открыть чат", "Shared from Veora · read only": "Отправлено из Veora · только чтение", "Sign in to view the shared chat.": "Войдите, чтобы открыть чат по ссылке.", "Gallery": "Галерея", "All": "Всё", "Images": "Картинки", "Videos": "Видео", "Audio": "Аудио", "Back": "Назад", "Back (Esc)": "Назад (Esc)", "Open chat": "Открыть чат", "Open image": "Открыть картинку", "Nothing here yet": "Здесь пока пусто", "Load more": "Показать ещё", "Try again": "Повторить", "Today": "Сегодня", "Yesterday": "Вчера", "Earlier": "Раньше", "Chat deleted": "Чат удалён",
  "Improve prompt": "Улучшить промпт", "Improve prompt with AI": "Улучшить промпт с помощью ИИ", "Improve": "Улучшить", "Undo": "Вернуть", "Undo improvement": "Отменить улучшение", "Bring back your original prompt": "Вернуть исходный промпт", "Write a prompt first, then improve it.": "Сначала напишите промпт, потом улучшайте.", "Prompt is too short": "Промпт слишком короткий", "Prompt improvement is included with Plus and higher.": "Улучшение промптов доступно на Plus и выше.", "Couldn't improve the prompt": "Не получилось улучшить промпт",
  "Video prompt": "Описание видео", "Describe the scene: subject, action, setting, camera movement, mood…": "Опишите сцену: кто или что в кадре, действие, место, движение камеры, настроение…", "Prompt": "Промпт", "Frames": "Кадры", "Optional": "Необязательно", "Start frame": "Первый кадр", "End frame": "Последний кадр", "Add a photo to animate it. With an end frame the clip moves from one image to the other.": "Добавьте фото, чтобы оживить его. С последним кадром ролик плавно перейдёт от одной картинки к другой.", "Aspect ratio": "Формат кадра", "Resolution": "Разрешение", "Duration": "Длительность", "Duration in seconds": "Длительность в секундах", "Sound": "Звук", "Music, ambience and voices generated with the video": "Музыка, фон и голоса генерируются вместе с видео", "Advanced": "Дополнительно", "Seed": "Seed", "Same seed and prompt give a similar result": "Одинаковый seed и промпт дают похожий результат", "Random": "Случайный", "Unlock video": "Открыть видео", "Starting…": "Запускаем…", "Generate video": "Создать видео", "Not enough video credits for these settings": "Не хватает видео-кредитов для этих настроек", "Not enough video credits for these settings. Try a shorter clip or 480p.": "Не хватает видео-кредитов для этих настроек. Сделайте ролик короче или выберите 480p.", "You've used this month's videos.": "Видео на этот месяц закончились.", "Use a JPG, PNG or WebP image.": "Нужна картинка JPG, PNG или WebP.", "Image is too large": "Картинка слишком большая (до 5 МБ)", "Unsupported image type": "Этот формат картинки не поддерживается", "Unknown video model": "Неизвестная видео-модель", "Describe the video": "Опишите видео", "Prompt is too long": "Промпт слишком длинный", "Unsupported video settings": "Эти настройки не поддерживаются моделью", "No video credits": "Видео-кредиты закончились", "Video not found": "Видео не найдено", "Play video": "Смотреть видео", "In queue…": "В очереди…", "Usually takes 1–3 minutes": "Обычно занимает 1–3 минуты", "The video couldn't be generated. Please try again.": "Не удалось создать видео. Попробуйте ещё раз.", "Blocked by the model's safety filter. Try rephrasing the prompt or using another photo.": "Заблокировано фильтром безопасности модели. Переформулируйте промпт или возьмите другое фото.", "The model took too long. Please try again.": "Модель отвечала слишком долго. Попробуйте ещё раз.", "Your video credit was refunded.": "Видео-кредит возвращён.", "With sound": "Со звуком", "Use these settings": "Использовать эти настройки", "Delete video": "Удалить видео", "Delete video?": "Удалить видео?", "It will be removed from your studio.": "Оно пропадёт из вашей студии.", "Video studio": "Видео-студия", "Turn a prompt or a photo into a short clip": "Превратите описание или фото в короткий ролик", "Create your first video": "Создайте первое видео", "Describe a scene or add a photo, pick the format and press Generate.": "Опишите сцену или добавьте фото, выберите формат и нажмите «Создать видео».", "Your video is ready": "Видео готово", "Video studio · 4–15 s clips with sound": "Видео-студия · ролики 4–15 с со звуком", "Fast, sharp motion, with sound": "Быстрая, чёткое движение, со звуком", "Lighter and cheaper, great for drafts": "Легче и дешевле, удобно для черновиков", "A paper boat drifting down a rainy neon street at night, cinematic, slow camera follow": "Бумажный кораблик плывёт по дождливой неоновой улице ночью, кинематографично, камера медленно следует за ним", "Golden retriever puppy running through autumn leaves in slow motion": "Щенок золотистого ретривера бежит по осенним листьям, замедленная съёмка", "Aerial shot over turquoise ocean waves crashing on black volcanic rocks": "Съёмка с воздуха: бирюзовые волны разбиваются о чёрные вулканические скалы", "A cozy coffee shop interior, steam rising from a latte, soft morning light": "Уютная кофейня, пар поднимается от латте, мягкий утренний свет", "Send a message to start your streak.": "Отправьте сообщение, чтобы начать серию.", "You're on fire — come back tomorrow to keep it going.": "Вы в ударе — возвращайтесь завтра, чтобы продолжить серию.", "Send a message today to keep your streak.": "Отправьте сообщение сегодня, чтобы не потерять серию.", "Send a message to start a new streak.": "Отправьте сообщение, чтобы начать новую серию.", "Your best streak": "Ваша лучшая серия", "30 days! Starter is yours free for a month.": "30 дней! Starter ваш бесплатно на месяц.", "Restore streak": "Вернуть серию", "Restore with Plus": "Вернуть с Plus", "Your plan lets you restore your best streak.": "Ваш тариф позволяет вернуть лучшую серию.", "Restoring a lost streak is included with Plus, Premium, Max and Elite.": "Вернуть потерянную серию можно на Plus, Premium, Max и Elite.", "Invalid subscribtion type": "Недоступно на вашем тарифе", "Not subscribed": "Нужна платная подписка", "Signed-in devices": "Устройства", "Sign out": "Выйти",
  "No devices": "Нет устройств", "This device": "Это устройство", "Unknown device": "Неизвестное устройство", "Sign out device?": "Выйти на устройстве?",
  "Name": "Имя", "Name updated": "Имя обновлено", "Avatar updated": "Аватар обновлён", "Change avatar": "Сменить аватар", "Avatar": "Аватар",
  "Appearance": "Оформление", "Language": "Язык", "Message color": "Цвет сообщений", "Basic+ unlocked": "Basic+ открыто",
  "Custom looks: Basic+": "Свой стиль: с Basic", "Theme default": "Как в теме",
  "System": "Системная", "Light": "Светлая", "Dark": "Тёмная",
  "Make my messages pop": "Пусть мои сообщения выделяются", "Done — your new look is saved on this device.": "Готово — новый стиль сохранён на этом устройстве.",
  "Custom themes and message colors are included with Basic, Plus, Premium, Max and Elite.":
    "Свои темы и цвета сообщений доступны с тарифами Basic, Plus, Premium, Max и Elite.",
  "Custom themes and message colors come with Basic and above.": "Свои темы и цвета сообщений доступны с тарифа Basic.",
  "Basic plan or higher": "Тариф Basic или выше",
  "Upgrade plan": "Улучшить тариф", "Manage subscription": "Управление подпиской", "Opening…": "Открываем…",
  "Unlock more requests, voice cloning and custom themes.": "Больше кредитов, все модели, свои голоса и темы.",
  "Choose your plan": "Выберите тариф", "Current plan": "Текущий тариф", "Opening checkout…": "Открываем оплату…",
  "Billed monthly through Stripe. Cancel anytime.": "Оплата ежемесячно через Stripe. Отменить можно в любой момент.",
  "Plans are unavailable right now.": "Тарифы сейчас недоступны.", "No video generation": "Без генерации видео", "No voice cloning": "Без своих голосов",
  "Custom themes & message colors": "Свои темы и цвета сообщений", "/ month": "/ мес",
  "Free plan": "Бесплатный тариф",
  "Payment received — activating your plan…": "Оплата получена — активируем тариф…",
  "Your plan is active. Enjoy Veora!": "Тариф активен. Приятного пользования!",
  "Payment received. Your plan will appear in a minute — refresh if it doesn't.": "Оплата получена. Тариф появится через минуту — обновите страницу, если нет.",
  "Checkout canceled — no charge was made.": "Оплата отменена — деньги не списаны.",
  "Subscription settings updated.": "Настройки подписки обновлены.",

  // ---------- voice studio & cloning ----------
  "Settings": "Настройки", "History": "История", "My voices": "Мои голоса", "Clone a voice": "Клонировать голос",
  "Clone your own voice": "Клонируйте свой голос", "Voice limit reached": "Лимит голосов исчерпан",
  "Included with Basic and higher plans.": "Доступно с тарифа Basic.",
  "Loading your voices…": "Загружаем голоса…", "Your voice": "Ваш голос", "Play sample": "Прослушать образец", "Stop sample": "Остановить",
  "Rename voice": "Переименовать голос", "Delete voice": "Удалить голос", "Delete voice?": "Удалить голос?",
  "Write in the language you want to hear — it's detected automatically.": "Пишите на нужном языке — он определяется автоматически.",
  "Model": "Модель", "Cloning model": "Модель клонирования", "Pick a preset voice above to switch back to the other models.": "Выберите готовый голос выше, чтобы вернуться к другим моделям.",
  "Auto-detect": "Автоопределение", "Output format": "Формат", "Cost": "Стоимость", "1 credit per generation": "1 Pro-запрос",
  "Best": "Лучший", "Most natural and expressive": "Самая естественная и выразительная", "Faster and lighter": "Быстрее и легче",
  "20+ languages, auto-detected": "20+ языков, определяются сами", "Voice cloning from your sample": "Клонирование по вашему образцу",
  "Most realistic": "Самая реалистичная", "Realistic and faster": "Реалистично и быстрее", "Natural, uses your transcript": "Естественно, учитывает расшифровку",
  "Firm": "Уверенный", "Upbeat": "Бодрый", "Breezy": "Лёгкий", "Informative": "Деловой",
  "Generate speech": "Озвучить", "Regenerate speech": "Озвучить заново", "Generating…": "Создаём…",
  "Start typing here or paste any text you want to turn into lifelike speech…": "Начните печатать или вставьте текст, который хотите озвучить живым голосом…",
  "Text to turn into speech": "Текст для озвучки", "Your generations in this chat will appear here.": "Здесь появятся озвучки из этого чата.",
  "Use this text": "Использовать этот текст",
  "Clone your voice": "Клонировать голос", "Record": "Запись", "Upload a file": "Загрузить файл", "Read this aloud": "Прочитайте вслух",
  "Start recording": "Начать запись", "Stop recording": "Остановить запись", "Record again": "Записать заново",
  "Quiet room, normal voice, 10–30 seconds.": "Тихое помещение, обычный голос, 10–30 секунд.",
  "Sounds good? Name it below — or record again.": "Звучит хорошо? Назовите голос ниже — или запишите заново.",
  "Drop an audio file or click to choose": "Перетащите аудиофайл или нажмите, чтобы выбрать",
  "Voice name, e.g. My voice": "Название голоса, например «Мой голос»", "My voice": "Мой голос",
  "This is my own voice, or I have the owner's permission to clone it. I won't use it to impersonate anyone.":
    "Это мой голос или у меня есть разрешение владельца. Я не буду выдавать себя за другого человека.",
  "Create voice": "Создать голос", "Creating…": "Создаём…", "Preparing audio…": "Готовим аудио…", "Your voice is ready": "Ваш голос готов",
  "Microphone access was blocked. Allow it in the browser, or upload a file instead.": "Доступ к микрофону запрещён. Разрешите его в браузере или загрузите файл.",
  "Microphone access was blocked. Allow it in your browser settings to dictate.": "Доступ к микрофону запрещён. Разрешите его в настройках браузера.",
  "Voice input isn't supported in this browser.": "Голосовой ввод не поддерживается в этом браузере.",
  "Couldn't hear anything. Try again a bit closer to the mic.": "Ничего не слышно. Попробуйте ближе к микрофону.",
  "Couldn't read this audio. Try an MP3 or WAV file.": "Не удалось прочитать аудио. Попробуйте MP3 или WAV.",
  "That file is too large. Use a shorter clip.": "Файл слишком большой. Возьмите запись короче.",
  "Couldn't play this sample.": "Не удалось воспроизвести образец.", "Couldn't load this audio.": "Не удалось загрузить аудио.",

  // ---------- image viewer ----------
  "Image viewer": "Просмотр фото", "Zoom in": "Приблизить", "Zoom out": "Отдалить", "Zoom in (+)": "Приблизить (+)", "Zoom out (−)": "Отдалить (−)",
  "Reset zoom (0)": "Сбросить масштаб (0)", "Open original": "Открыть оригинал", "Close (Esc)": "Закрыть (Esc)",
  "Previous image": "Предыдущее фото", "Next image": "Следующее фото", "Couldn't load this image.": "Не удалось загрузить фото.",

  // ---------- errors (dom.js) ----------
  "You're out of requests for this model. They refill automatically, or upgrade your plan.": "Лимит на эту модель исчерпан. Он пополнится автоматически — или улучшите тариф.",
  "Your account is temporarily restricted.": "Ваш аккаунт временно ограничен.",
  "That code isn't right. Check your email and try again.": "Неверный код. Проверьте письмо и попробуйте снова.",
  "A code was already sent. Check your inbox (and spam).": "Код уже отправлен. Проверьте входящие (и спам).",
  "The model couldn't generate a response. Try again or pick another model.": "Модель не смогла ответить. Попробуйте ещё раз или выберите другую.",
  "This model isn't available.": "Эта модель недоступна.", "You can attach up to 5 photos.": "Можно прикрепить до 5 фото.",
  "The site isn't configured with the API key (see frontend/js/config.js).": "На сайте не настроен API-ключ.",
  "Your session expired. Please sign in again.": "Сессия истекла. Войдите снова.",
  "Too many requests. Wait a minute and try again.": "Слишком много запросов. Подождите минуту.",
  "Can't reach the server. Check your connection.": "Нет связи с сервером. Проверьте интернет.",
  "Google sign-in failed. Try again or use email.": "Не удалось войти через Google. Попробуйте ещё раз или войдите по почте.",
  "Your Google account email isn't verified.": "Почта вашего Google-аккаунта не подтверждена.",
  "That's too long to read aloud. Voice models take up to 3000 characters.": "Слишком длинный текст. Для озвучки — до 3000 символов.",
  "Type some text to read aloud.": "Введите текст для озвучки.",
  "Voice models don't accept images. Pick another model to send photos.": "Голосовые модели не принимают фото. Выберите другую модель.",
  "Cloning your voice is included with Basic and higher plans.": "Клонирование голоса доступно с тарифа Basic.",
  "You've reached your plan's voice limit. Delete a voice or upgrade your plan.": "Достигнут лимит голосов тарифа. Удалите голос или улучшите тариф.",
  "That recording is too large. Use a shorter clip.": "Запись слишком большая. Возьмите короче.",
  "This audio format isn't supported. Try MP3 or WAV.": "Этот формат не поддерживается. Попробуйте MP3 или WAV.",
  "The recording is empty. Try again.": "Запись пустая. Попробуйте ещё раз.",
  "This voice no longer exists. Pick another one.": "Этого голоса больше нет. Выберите другой.",
  "Give the voice a name up to 40 characters.": "Дайте голосу название до 40 символов.",
  "You already have a plan. Cancel it in “Manage subscription” before switching.": "У вас уже есть тариф. Отмените его в «Управлении подпиской», чтобы сменить.",
  "We couldn't find a subscription bought on this site for your account.": "Мы не нашли подписку, оформленную на этом сайте для вашего аккаунта.",
  "This plan isn't available.": "Этот тариф недоступен.",
  "You've used this month's video generations. They refill monthly — or upgrade for more.": "Видео на этот месяц закончились. Они пополнятся в следующем месяце — или улучшите тариф.",
  "Not enough credits left today for this model. Pick a cheaper model or upgrade your plan.": "На эту модель сегодня не хватает кредитов. Выберите модель дешевле или улучшите тариф.",
  "Your plan allows fewer photos per message. Upgrade to send up to 5.": "Ваш тариф позволяет меньше фото в сообщении. С тарифом выше — до 5.",
  "Couldn't copy to the clipboard.": "Не удалось скопировать.", "This folder is not available.": "Эта папка недоступна.",
  "Server error": "Ошибка сервера",

  // ---------- leftovers found by crawling the Russian UI ----------
  "Resize sidebar": "Изменить ширину панели", "Drag to resize · double-click to reset": "Потяните, чтобы изменить ширину · двойной клик — сбросить",
  "Smart": "Рекомендуем", "Veora needs JavaScript to run.": "Для работы Veora нужен JavaScript.",
  "Voice models don't accept images": "Голосовые модели не принимают фото",
  "Footer": "Подвал", "Sections": "Разделы", "Veora crystal, drag to spin": "Кристалл Veora — потяните, чтобы покрутить", "Veora in numbers": "Veora в цифрах",
  "Violet": "Фиолетовый", "Ocean": "Океан", "Emerald": "Изумрудный", "Rose": "Розовый", "Gold": "Золотой", "Graphite": "Графит", "Mint": "Мятный",
  "Close image viewer": "Закрыть просмотр",

  // ---------- custom GPTs ----------
  "My GPTs": "Мои GPT", "Edit GPT": "Изменить GPT", "Delete GPT": "Удалить GPT", "Your own assistant with custom instructions": "Свой ассистент со своими инструкциями", "Create a GPT": "Создать GPT", "GPT options": "Действия с GPT", "Edit": "Изменить",
  "Create your own assistant with custom instructions": "Создайте своего ассистента со своими инструкциями",
  "Use this GPT": "Включить этот GPT", "Turn off": "Выключить", "Turn off the custom GPT": "Выключить свой GPT", "ON": "ВКЛ",
  "Custom GPT turned off": "Свой GPT выключен", "Delete GPT?": "Удалить GPT?",
  "Your custom GPT is on. Its instructions apply to every message.": "Ваш GPT включён — его инструкции применяются к каждому сообщению.",
  "Start from a template": "Начните с шаблона", "Name, e.g. Travel planner": "Название, например «Планировщик поездок»",
  "Instructions": "Инструкции", "GPT name": "Название", "Instructions: who the assistant is, how it should answer, what to focus on…": "Инструкции: кто этот ассистент, как отвечать, на чём фокусироваться…",
  "These instructions are added to every message while the GPT is on.": "Эти инструкции добавляются к каждому сообщению, пока GPT включён.",
  "Give the GPT a name up to 60 characters.": "Дайте GPT название до 60 символов.", "Add instructions — up to 4000 characters.": "Добавьте инструкции — до 4000 символов.",
  "You can have up to 20 custom GPTs. Delete one to add another.": "Можно создать до 20 своих GPT. Удалите один, чтобы добавить новый.",
  "This GPT no longer exists.": "Этого GPT больше нет.",
  "Translator": "Переводчик", "Code reviewer": "Ревьюер кода", "English tutor": "Репетитор английского", "Copywriter": "Копирайтер",
};

const tr = (s) => RU[s] || s;
const credits = (n) => `${n} ${plural(n, "кредит", "кредита", "кредитов")}`;

// Strings that contain numbers or names.
const PATTERNS = [
  [/^Paid another way or need help\? Write to (.+)\.$/, (m) => `Платили иначе или нужна помощь? Напишите на ${m[1]}.`],
  [/^The card will be removed from Veora and won't be charged again\. Your plan stays active until (.+)\.$/, (m) => `Карта будет удалена из Veora, списаний с неё больше не будет. Тариф останется активным до ${m[1]}.`],
  [/^Your plan stays active until (.+), then it switches to Free\. No more charges\.$/, (m) => `Тариф будет действовать до ${m[1]}, потом аккаунт перейдёт на бесплатный. Списаний больше не будет.`],
  [/^No online subscription found\. If you paid another way or need help, write to (.+)\.$/, (m) => `Онлайн-подписка не найдена. Если вы платили иначе или нужна помощь, напишите на ${m[1]}.`],
  [/^Create (\d+) images$/, (m) => `Создать ${m[1]} ${plural(+m[1], "картинку", "картинки", "картинок")}`],
  [/^(\d+) images?$/, (m) => `${m[1]} ${plural(+m[1], "картинка", "картинки", "картинок")}`],
  [/^Up to (\d+) photos\.$/, (m) => `Не больше ${m[1]} фото.`],
  [/^(\d+) cr$/, (m) => `${m[1]} ${plural(+m[1], "кредит", "кредита", "кредитов")}`],
  [/^(\d+) of (\d+) credits today$/, (m) => `${m[1]} из ${m[2]} ${+m[2] % 10 === 1 && +m[2] % 100 !== 11 ? "кредита" : "кредитов"} сегодня`],
  [/^(\d+) Pro requests?$/, (m) => `${m[1]} ${plural(+m[1], "Pro-запрос", "Pro-запроса", "Pro-запросов")}`],
    [/^(\d+) Pro requests were refunded\.$/, (m) => `${m[1]} ${plural(+m[1], "Pro-запрос возвращён", "Pro-запроса возвращены", "Pro-запросов возвращены")}.`],
  [/^(\d+) left$/, (m) => `осталось ${m[1]}`],
  [/^(\d+) tracks?$/, (m) => `${m[1]} ${plural(+m[1], "трек", "трека", "треков")}`],
  [/^(\d+) credits? per message$/, (m) => `${m[1]} ${plural(+m[1], "кредит", "кредита", "кредитов")} за сообщение`],
  [/^Name must be (\d+) to (\d+) characters\.$/, (m) => `Имя должно быть от ${m[1]} до ${m[2]} символов.`],
  [/^Subscription management is coming soon\. If you need help with your plan, write to (.+)\.$/, (m) => `Управление подпиской скоро появится. Если нужна помощь с тарифом, напишите на ${m[1]}.`],
  [/^(\d+) of (\d+) restores left this month$/, (m) => `Осталось ${m[1]} из ${m[2]} восстановлений в этом месяце`],
  [/^You've used all (\d+) restores this month\. They refill every 30 days\.$/, (m) => `Вы использовали все ${m[1]} ${plural(+m[1], "восстановление", "восстановления", "восстановлений")} в этом месяце. Они обновляются раз в 30 дней.`],
  [/^(\d+)(\+?) items?$/, (m) => `${m[1]}${m[2]} ${plural(+m[1], "файл", "файла", "файлов")}`],
  [/^Everything you generate — (.+) — will show up here\.$/, (m) => `Всё, что вы создадите (${{ "images, videos or audio": "картинки, видео и аудио", images: "картинки", videos: "видео", audio: "аудио" }[m[1]] || m[1]}), появится здесь.`],
  [/^(\d+) s$/, (m) => `${m[1]} с`],
  [/^(\d+)s$/, (m) => `${m[1]} с`],
  [/^(\d+) video credits?$/, (m) => `${m[1]} ${plural(+m[1], "видео-кредит", "видео-кредита", "видео-кредитов")}`],
  [/^(\d+) left this month$/, (m) => `осталось ${m[1]} в этом месяце`],
  [/^(\d+) videos?$/, (m) => `${m[1]} ${plural(+m[1], "видео", "видео", "видео")}`],
  [/^(\d+) video credits were refunded\.$/, (m) => `${m[1]} ${plural(+m[1], "видео-кредит возвращён", "видео-кредита возвращены", "видео-кредитов возвращены")}.`],
  [/^(Start frame|End frame): (add|change) image$/, (m) => `${m[1] === "Start frame" ? "Первый кадр" : "Последний кадр"}: ${m[2] === "add" ? "добавить" : "заменить"} картинку`],
  [/^Remove (start|end) frame$/, (m) => `Убрать ${m[1] === "start" ? "первый" : "последний"} кадр`],
  [/^(\d+) days?$/, (m) => `${m[1]} ${plural(+m[1], "день", "дня", "дней")}`],
  [/^(\d+) more days to get Starter free for a month$/, (m) => `Ещё ${m[1]} ${plural(+m[1], "день", "дня", "дней")} — и Starter бесплатно на месяц`],
  [/^Get your (\d+)-day streak back$/, (m) => `Верните серию в ${m[1]} ${plural(+m[1], "день", "дня", "дней")}`],
  [/^Streak restored: (\d+) days?$/, (m) => `Серия восстановлена: ${m[1]} ${plural(+m[1], "день", "дня", "дней")}`],
  [/^(\d+)-day streak$/, (m) => `Серия: ${m[1]} ${plural(+m[1], "день", "дня", "дней")}`],
  [/^Best streak: (\d+) days\. Restore it in your account\.$/, (m) => `Лучшая серия: ${m[1]} ${plural(+m[1], "день", "дня", "дней")}. Её можно вернуть в аккаунте.`],
  [/^(\d+) credits today(?: · (\d+) Pro requests?)?(?: · (\d+) videos?)? left$/, (m) =>
    `Осталось: ${credits(+m[1])} сегодня${m[2] ? ` · ${m[2]} ${plural(+m[2], "Pro-запрос", "Pro-запроса", "Pro-запросов")}` : ""}${m[3] ? ` · ${m[3]} видео` : ""}`],
  [/^(\d+) credits \/ day · all models$/, (m) => `${credits(+m[1])} в день · все модели`],
  [/^(\d+) Pro requests \/ month$/, (m) => `${m[1]} ${plural(+m[1], "Pro-запрос", "Pro-запроса", "Pro-запросов")} в месяц`],
  [/^(\d+) videos? \/ month$/, (m) => `${m[1]} видео в месяц`],
  [/^(\d+) cloned voices?$/, (m) => `${m[1]} ${plural(+m[1], "свой голос", "своих голоса", "своих голосов")}`],
  [/^(\d+) cloned voices? & custom themes$/, (m) => `${m[1]} ${plural(+m[1], "свой голос", "своих голоса", "своих голосов")} и свои темы`],
  [/^(\d+) photos per message$/, (m) => `До ${m[1]} фото в сообщении`],
  [/^(\d+) credits? remaining$/, (m) => `Осталось ${m[1]} ${plural(+m[1], "Pro-запрос", "Pro-запроса", "Pro-запросов")}`],
  [/^×(\d+) credits$/, (m) => `×${credits(+m[1])}`],
  [/^Generation (\d+)$/, (m) => `Озвучка ${m[1]}`],
  [/^Generation (\d+) · (.+)$/, (m) => `Озвучка ${m[1]} · ${tr(m[2])}`],
  [/^([\d.,\s\u00a0\u202f]+) \/ ([\d.,\s\u00a0\u202f]+) characters$/, (m) => `${m[1]} / ${m[2]} символов`],
  [/^Choose from (\d+\+?) models or let Veora route each request to the best one\.$/, (m) => `Выберите из ${m[1]} моделей или доверьте Veora выбор лучшей для каждого запроса.`],
  [/^(\d+\+?) models · images · video · voice$/, (m) => `${m[1]} моделей · картинки · видео · голос`],
  [/^All (\d+\+?) models$/, (m) => `Все ${m[1]} моделей`],
  [/^(\d+) credits a day with fast models \(GPT-6 Luna, Llama 4, Gemma, Mistral\)\. Every paid plan unlocks all models\.$/, (m) =>
    `${credits(+m[1])} в день на быстрые модели (GPT-6 Luna, Llama 4, Gemma, Mistral). Любой платный тариф открывает все модели.`],
  [/^Choose (\w+)$/, (m) => `Выбрать ${m[1]}`],
  [/^Get (Starter|Basic|Plus|Premium|Max|Elite)$/, (m) => `Оформить ${m[1]}`],
  [/^Translate · (.+)$/, (m) => `Перевести · ${m[1]}`],
  [/^Translated to (.+)$/, (m) => `Переведено: ${m[1]}`],
  [/^(\w+) voice$/, (m) => `Голос ${m[1]}`],
  [/^(Starter|Basic|Plus|Premium|Max|Elite) plan$/, (m) => `Тариф ${m[1]}`],
  [/^How can I help, (.+)\?$/, (m) => `Чем могу помочь, ${m[1]}?`],
  [/^Renews or ends on (.+)\.$/, (m) => `Продлится или закончится ${m[1].replace(/\.$/, "")}.`],
  [/^Last active (.+)$/, (m) => `Последняя активность: ${m[1]}`],
  [/^You're on (\w+)\. To switch plans, cancel it in "Manage subscription" first\.$/, (m) =>
    `У вас тариф ${m[1]}. Чтобы сменить его, сначала отмените текущий в «Управлении подпиской».`],
  [/^Tags · (.+)$/, (m) => `Теги · ${m[1]}`],
  [/^“(.+)” will be deleted\. Its chats stay in your chat list\.$/, (m) => `Папка «${m[1]}» будет удалена. Её чаты останутся в списке.`],
  [/^“(.+)” and its recording will be permanently deleted\.$/, (m) => `Голос «${m[1]}» и его запись будут удалены навсегда.`],
  [/^(.+) will be signed out\.$/, (m) => `${tr(m[1])}: будет выполнен выход.`],
  [/^(.+) is larger than 5 MB$/, (m) => `${m[1]} больше 5 МБ`],
  [/^You can attach up to (\d+) photos\.$/, (m) => `Можно прикрепить до ${m[1]} фото.`],
  [/^Keep going — at least (\d+) seconds are needed\.$/, (m) => `Продолжайте — нужно минимум ${m[1]} секунд.`],
  [/^Recording… stop any time after (\d+) s$/, (m) => `Идёт запись… остановить можно после ${m[1]} с`],
  [/^That's only (\d+) s — we need at least (\d+) s of speech\.$/, (m) => `Всего ${m[1]} с — нужно минимум ${m[2]} с речи.`],
  [/^MP3, WAV, M4A… · at least (\d+) s of clear speech · we use the first (\d+) s$/, (m) => `MP3, WAV, M4A… · минимум ${m[1]} с чистой речи · используем первые ${m[2]} с`],
  [/^(\d+:\d\d) · ready$/, (m) => `${m[1]} · готово`],
  [/^Voice models take up to (.+) characters\.$/, (m) => `Для озвучки — до ${m[1]} символов.`],
  [/^(Back|Forward) (\d+) seconds$/, (m) => `${m[1] === "Back" ? "Назад" : "Вперёд"} на ${m[2]} с`],
  [/^Remove (.+)$/, (m) => `Удалить ${m[1]}`],
  [/^(.+) is on$/, (m) => `${m[1]} включён`],
  [/^Message (.+)…$/, (m) => `Сообщение для ${m[1]}…`],
  [/^“(.+)” will be deleted\. Your chats stay\.$/, (m) => `«${m[1]}» будет удалён. Ваши чаты останутся.`],
];

export function t(text) {
  const key = text.trim();
  if (!key) return null;
  if (RU[key]) return RU[key];
  for (const [re, fn] of PATTERNS) {
    const m = key.match(re);
    if (m) return fn(m);
  }
  return null;
}

// User content and data that must stay as is.
const SKIP = ".md, .bubble, .chat-link > span, .tts-editor, .tts-history-text > span, .model-trigger-label, .msg-model, "
  + "pre, code, textarea, input, select, .tag-chip, .profile-meta strong, .tts-player-info strong, .clone-script p, .l-model, .l-group li, "
  + ".lang-switch, .ac-time, .dict-time, .vg-time, .folder-option > span, .devices strong, .gpt-chip > span, .gpt-name, .gpt-desc, "
  + ".gal-caption p, .vs-card-prompt, .ms-title, .ms-lyrics-text, .ps-prompt, .l-req-row dd, .auth-legal, .plans-legal, .legal-doc, .legal-tabs";
// Our own sample texts that sit inside otherwise-skipped elements.
const UNSKIP = ".appearance-preview";
const ATTRS = ["placeholder", "title", "aria-label"];

function translateText(node) {
  const parent = node.parentElement;
  if (!parent || (parent.closest(SKIP) && !parent.closest(UNSKIP))) return;
  const value = node.nodeValue;
  const out = t(value);
  if (out && out !== value.trim()) {
    const lead = value.match(/^\s*/)[0];
    const trail = value.match(/\s*$/)[0];
    node.nodeValue = lead + out + trail;
  }
}

function translateAttrs(el) {
  if (el.closest(".lang-switch")) return;
  for (const name of ATTRS) {
    const v = el.getAttribute(name);
    if (!v) continue;
    // Chat and folder names show up as titles; leave those alone.
    if (name === "title" && el.matches(".chat-link:not(.gpt-link)")) continue;
    const out = t(v);
    if (out) el.setAttribute(name, out);
  }
}

function translateTree(root) {
  if (root.nodeType === Node.TEXT_NODE) { translateText(root); return; }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  translateAttrs(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let node;
  while ((node = walker.nextNode())) {
    if (node.nodeType === Node.TEXT_NODE) translateText(node); else translateAttrs(node);
  }
}

/** Small EN / RU switch, reloads the page in the other language. */
export function languageSwitch(extraClass = "") {
  const wrap = document.createElement("div");
  wrap.className = `lang-switch ${extraClass}`.trim();
  wrap.setAttribute("role", "group");
  wrap.setAttribute("aria-label", lang === "ru" ? "Язык" : "Language");
  for (const code of ["en", "ru"]) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = code.toUpperCase();
    b.className = code === lang ? "active" : "";
    b.setAttribute("aria-pressed", String(code === lang));
    b.addEventListener("click", () => { if (code !== lang) setLang(code); });
    wrap.append(b);
  }
  return wrap;
}

export function startI18n() {
  document.documentElement.lang = lang;
  if (lang !== "ru") return;
  document.title = "Veora";
  document.querySelector('meta[name="description"]')?.setAttribute("content",
    "Общайтесь с 30+ ИИ-моделями от OpenAI, Anthropic, Google, Meta, Mistral и других в одном месте.");
  translateTree(document.body);
  new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === "childList") m.addedNodes.forEach(translateTree);
      else if (m.type === "attributes") translateAttrs(m.target);
      else if (m.type === "characterData") translateText(m.target);
    }
  }).observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
