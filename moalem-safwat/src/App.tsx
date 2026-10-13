import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  BookOpen, CalendarDays, CheckCircle2, ChevronLeft, CircleHelp, Clock3,
  GraduationCap, Home, Languages, LogIn, LogOut, Menu, MessageCircle,
  Play, Send, ShieldCheck, Sparkles, Star, UserRound, X,
} from 'lucide-react';
import { isSupabaseConfigured, supabase, type StudentProfile } from './lib/supabase';

type Tab = 'home' | 'curriculum' | 'tutor' | 'games' | 'progress' | 'profile';
type Session = { user: { id: string; email?: string } };
type TimetableEntry = {
  id: string;
  day_of_week: number;
  subject_name: string;
  lesson_title: string | null;
  start_time: string;
};
type CurriculumLesson = {
  id: string; grade_level: number; subject_name: string; unit_title: string | null;
  lesson_title: string; lesson_content: string; source_book: string; source_edition: string | null;
  page_start: number | null; page_end: number | null;
};

const DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const GRADES = [
  ...Array.from({ length: 9 }, (_, i) => ({ value: String(i + 1), label: `الصف ${i + 1} الأساسي` })),
  { value: '10', label: 'الأول الثانوي' },
  { value: '11', label: 'الثاني الثانوي' },
  { value: '12', label: 'الثالث الثانوي' },
];

const WORDS = [
  { en: 'Book', ar: 'كتاب' }, { en: 'School', ar: 'مدرسة' },
  { en: 'Water', ar: 'ماء' }, { en: 'Friend', ar: 'صديق' },
  { en: 'Teacher', ar: 'معلّم' }, { en: 'Sun', ar: 'شمس' },
  { en: 'Family', ar: 'عائلة' }, { en: 'Pencil', ar: 'قلم رصاص' },
];

const NAV: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: 'home', label: 'الرئيسية', icon: Home },
  { id: 'curriculum', label: 'المنهج والدروس', icon: BookOpen },
  { id: 'tutor', label: 'اسأل المعلّم', icon: MessageCircle },
  { id: 'games', label: 'الألعاب والتدريبات', icon: Play },
  { id: 'progress', label: 'تقدّمي الدراسي', icon: Star },
  { id: 'profile', label: 'ملفي وجدولي', icon: UserRound },
];

function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('home');
  const [mobileNav, setMobileNav] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'signup'>('signup');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [notice, setNotice] = useState(isSupabaseConfigured ? '' : 'وضع الاستكشاف متاح دون حساب؛ حفظ البيانات والشرح الذكي يحتاجان إلى ربط Supabase.');
  const [offlineMode, setOfflineMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState<StudentProfile>({
    full_name: '', grade_level: '', academic_track: null, school_name: null,
  });
  const [timetable, setTimetable] = useState<TimetableEntry[]>([]);
  const [lessons, setLessons] = useState<CurriculumLesson[]>([]);
  const [selectedLesson, setSelectedLesson] = useState<CurriculumLesson | null>(null);
  const [day, setDay] = useState('0');
  const [subject, setSubject] = useState('');
  const [lesson, setLesson] = useState('');
  const [time, setTime] = useState('08:00');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [mathA, setMathA] = useState(() => Math.floor(Math.random() * 9) + 1);
  const [mathB, setMathB] = useState(() => Math.floor(Math.random() * 9) + 1);
  const [mathAnswer, setMathAnswer] = useState('');
  const [gameFeedback, setGameFeedback] = useState('');
  const [mathScore, setMathScore] = useState(0);
  const [wordIndex, setWordIndex] = useState(0);
  const [wordChoices, setWordChoices] = useState<string[]>([]);
  const [wordFeedback, setWordFeedback] = useState('');

  useEffect(() => {
    if (!supabase) { setAuthLoading(false); return; }
    supabase.auth.getSession().then(({ data, error }) => {
      if (error) setNotice('تعذر التحقق من جلسة الدخول. حاول مجددًا.');
      setSession(data.session as Session | null);
      setAuthLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, current) => {
      setSession(current as Session | null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session || !supabase) return;
    let cancelled = false;
    async function loadStudentData() {
      const client = supabase;
      if (!client || !session) return;
      const [p, schedule, curriculum] = await Promise.all([
        client.from('student_profiles').select('full_name,grade_level,academic_track,school_name').eq('user_id', session.user.id).maybeSingle(),
        client.from('timetable_entries').select('id,day_of_week,subject_name,lesson_title,start_time').eq('user_id', session.user.id).order('day_of_week').order('start_time'),
        client.from('curriculum_lessons').select('id,grade_level,subject_name,unit_title,lesson_title,lesson_content,source_book,source_edition,page_start,page_end').eq('published', true).eq('review_status', 'approved').order('grade_level').order('subject_name'),
      ]);
      if (cancelled) return;
      if (p.error || schedule.error || curriculum.error) {
        setNotice('تعذر تحميل البيانات الدراسية. تحقق من تطبيق ترحيلات قاعدة البيانات وسياسات الأمان.');
        return;
      }
      if (p.data) setProfile({
        full_name: p.data.full_name ?? '',
        grade_level: String(p.data.grade_level ?? ''),
        academic_track: p.data.academic_track ?? null,
        school_name: p.data.school_name ?? null,
      });
      setTimetable((schedule.data ?? []) as TimetableEntry[]);
      setLessons((curriculum.data ?? []) as CurriculumLesson[]);
    }
    void loadStudentData();
    return () => { cancelled = true; };
  }, [session]);

  useEffect(() => {
    const correct = WORDS[wordIndex].ar;
    const other = WORDS[(wordIndex + 2) % WORDS.length].ar;
    const third = WORDS[(wordIndex + 5) % WORDS.length].ar;
    setWordChoices([correct, other, third].sort(() => Math.random() - 0.5));
    setWordFeedback('');
  }, [wordIndex]);

  const todaySchedule = useMemo(
    () => timetable.filter((entry) => entry.day_of_week === new Date().getDay()).sort((a, b) => a.start_time.localeCompare(b.start_time)),
    [timetable],
  );
  const visibleLessons = useMemo(
    () => lessons.filter((item) => !profile.grade_level || String(item.grade_level) === profile.grade_level),
    [lessons, profile.grade_level],
  );

  async function handleAuth(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setBusy(true); setNotice('');
    try {
      if (authMode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email: authEmail.trim(), password: authPassword,
          options: { data: { full_name: authName.trim() } },
        });
        if (error) throw error;
        if (data.session) setNotice('تم إنشاء الحساب بنجاح.');
        else setNotice('تم إنشاء الطلب. تحقق من بريدك الإلكتروني لتأكيد الحساب قبل الدخول.');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: authEmail.trim(), password: authPassword });
        if (error) throw error;
        setNotice('تم تسجيل الدخول.');
      }
    } catch (e) {
      setNotice(e instanceof Error ? e.message : 'تعذر إكمال العملية.');
    } finally { setBusy(false); }
  }

  async function saveProfile(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !session) { setNotice('للحفاظ على ملفك الدراسي في السحابة، اربط مشروع Supabase وسجّل الدخول أولًا.'); return; }
    setBusy(true); setNotice('');
    const { error } = await supabase.from('student_profiles').upsert({
      user_id: session.user.id,
      full_name: profile.full_name.trim(),
      grade_level: Number(profile.grade_level),
      academic_track: profile.academic_track || null,
      school_name: profile.school_name?.trim() || null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });
    setBusy(false);
    setNotice(error ? `لم يتم حفظ الملف: ${error.message}` : 'تم حفظ ملفك الدراسي في قاعدة البيانات.');
  }

  async function addTimetableEntry(event: FormEvent) {
    event.preventDefault();
    if (!supabase || !session) { setNotice('إضافة الحصص وحفظها يحتاجان إلى ربط Supabase وتسجيل الدخول.'); return; }
    if (!subject.trim()) return;
    setBusy(true); setNotice('');
    const { data, error } = await supabase.from('timetable_entries').insert({
      user_id: session.user.id, day_of_week: Number(day), subject_name: subject.trim(),
      lesson_title: lesson.trim() || null, start_time: time,
    }).select('id,day_of_week,subject_name,lesson_title,start_time').single();
    setBusy(false);
    if (error) { setNotice(`لم يُحفظ الحصّة: ${error.message}`); return; }
    setTimetable((prev) => [...prev, data as TimetableEntry].sort((a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time)));
    setSubject(''); setLesson(''); setNotice('تمت إضافة الحصة إلى جدولك.');
  }

  async function removeTimetableEntry(id: string) {
    if (!supabase || !session) return;
    const { error } = await supabase.from('timetable_entries').delete().eq('id', id).eq('user_id', session.user.id);
    if (error) { setNotice('تعذر حذف الحصة. حاول مرة أخرى.'); return; }
    setTimetable((prev) => prev.filter((entry) => entry.id !== id));
  }

  async function askTutor(event: FormEvent) {
    event.preventDefault();
    if (!question.trim()) return;
    if (!supabase || !session) { setAnswer('خدمة الشرح الذكي غير مفعّلة في وضع الاستكشاف. اربط Supabase وسجّل الدخول ثم جهّز وظيفة student-tutor ومفتاح مزوّد الذكاء الاصطناعي على الخادم.'); return; }
    setBusy(true); setAnswer(''); setNotice('');
    try {
      const { data, error } = await supabase.functions.invoke('student-tutor', {
        body: { question: question.trim(), grade_level: profile.grade_level || null },
      });
      if (error) throw error;
      const response = data?.answer;
      if (typeof response !== 'string' || !response.trim()) throw new Error('لم تصل إجابة صالحة من خدمة المعلّم.');
      setAnswer(response);
    } catch {
      setAnswer('خدمة الشرح الذكي غير مهيأة بعد. يلزم نشر وظيفة Supabase باسم student-tutor وربطها بمزوّد ذكاء اصطناعي آمن من جهة الخادم. لن أخترع إجابة أو أنسبها إلى كتاب غير متوفر.');
    } finally { setBusy(false); }
  }

  function checkMath(event: FormEvent) {
    event.preventDefault();
    if (Number(mathAnswer) === mathA + mathB) {
      setGameFeedback('أحسنت! إجابتك صحيحة 🌟'); setMathScore((score) => score + 1);
    } else setGameFeedback(`حاول مرة أخرى. اجمع ${mathA} و${mathB} بهدوء.`);
  }

  function nextMath() {
    setMathA(Math.floor(Math.random() * 20) + 1);
    setMathB(Math.floor(Math.random() * 20) + 1);
    setMathAnswer(''); setGameFeedback('');
  }

  function chooseWord(choice: string) {
    if (choice === WORDS[wordIndex].ar) setWordFeedback(`صحيح! ${WORDS[wordIndex].en} تعني ${WORDS[wordIndex].ar}.`);
    else setWordFeedback(`حاول مرة أخرى. معنى ${WORDS[wordIndex].en} هو ${WORDS[wordIndex].ar}.`);
  }

  async function signOut() {
    if (!supabase) return;
    await supabase.auth.signOut();
    setProfile({ full_name: '', grade_level: '', academic_track: null, school_name: null });
    setTimetable([]); setTab('home'); setNotice('تم تسجيل الخروج.');
  }

  if (authLoading) return <div className="loading-screen"><div className="loader" /><p>جارٍ تجهيز المعلّم صفوت…</p></div>;

  if (!isSupabaseConfigured && !offlineMode) return (
    <main className="setup-screen">
      <div className="setup-card">
        <div className="brand-symbol"><GraduationCap size={34} /></div>
        <p className="eyebrow">رفيق الطالب اليمني</p>
        <h1>المعلّم صفوت</h1>
        <p className="setup-copy">بدأ تجهيز التطبيق، لكن تسجيل الحسابات وحفظ بيانات الطلاب يحتاجان إلى مشروع Supabase مخصصًا لهذه المنصة.</p>
        <div className="setup-status"><ShieldCheck size={20} /><span>لم يتم ربط قاعدة بيانات بعد، ولم تُنشأ بيانات طلاب تجريبية.</span></div>
        <ol>
          <li>أنشئ مشروع Supabase مستقلًا باسم المعلّم صفوت.</li>
          <li>طبّق ملف الترحيل الموجود في <code>supabase/migrations</code>.</li>
          <li>أضف عنوان المشروع والمفتاح العام إلى متغيرات البيئة.</li>
        </ol>
        <p className="small-muted">لن نستخدم قاعدة بيانات الفائق يمن أو نعرض بيانات وهمية على أنها حقيقية.</p>
        <button className="primary-btn full-btn" type="button" onClick={() => setOfflineMode(true)}>استكشف الواجهة والألعاب دون حساب <ChevronLeft size={17} /></button>
      </div>
    </main>
  );

  if (isSupabaseConfigured && !session) return (
    <main className="auth-screen">
      <section className="auth-hero">
        <div className="brand-symbol"><GraduationCap size={38} /></div>
        <p className="eyebrow">رفيقك الدراسي كل يوم</p>
        <h1>المعلّم صفوت</h1>
        <p>نتعلّم خطوة بخطوة، ونفهم الدرس، ثم نجرّب بأنفسنا.</p>
        <div className="hero-points"><span><BookOpen size={17} /> المنهج اليمني</span><span><Sparkles size={17} /> شرح مبسّط</span><span><Star size={17} /> ألعاب تعليمية</span></div>
      </section>
      <form className="auth-card" onSubmit={handleAuth}>
        <h2>{authMode === 'signup' ? 'أنشئ حساب الطالب' : 'مرحبًا بعودتك'}</h2>
        <p className="muted">بياناتك الدراسية تبقى مرتبطة بحسابك.</p>
        {authMode === 'signup' && <label>اسم الطالب<input required minLength={2} value={authName} onChange={(e) => setAuthName(e.target.value)} autoComplete="name" /></label>}
        <label>البريد الإلكتروني<input required type="email" value={authEmail} onChange={(e) => setAuthEmail(e.target.value)} autoComplete="email" /></label>
        <label>كلمة المرور<input required type="password" minLength={8} value={authPassword} onChange={(e) => setAuthPassword(e.target.value)} autoComplete={authMode === 'signup' ? 'new-password' : 'current-password'} /></label>
        <button className="primary-btn full-btn" disabled={busy} type="submit">{busy ? 'جارٍ التنفيذ…' : authMode === 'signup' ? 'إنشاء الحساب' : 'تسجيل الدخول'} <LogIn size={18} /></button>
        <button className="text-btn" type="button" onClick={() => setAuthMode(authMode === 'signup' ? 'login' : 'signup')}>{authMode === 'signup' ? 'لديك حساب؟ سجّل الدخول' : 'ليس لديك حساب؟ أنشئ حسابًا'}</button>
        {notice && <p className="notice" role="status">{notice}</p>}
      </form>
    </main>
  );

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? 'sidebar-open' : ''}`}>
        <div className="sidebar-brand"><div className="brand-symbol small"><GraduationCap size={25} /></div><div><strong>المعلّم صفوت</strong><small>رفيقك الدراسي</small></div><button className="icon-btn close-nav" aria-label="إغلاق القائمة" onClick={() => setMobileNav(false)}><X size={19} /></button></div>
        <div className="student-mini"><div className="avatar"><UserRound size={21} /></div><div><strong>{profile.full_name || 'طالب جديد'}</strong><small>{GRADES.find((g) => g.value === profile.grade_level)?.label || 'أكمل ملفك الدراسي'}</small></div></div>
        <nav aria-label="التنقل الرئيسي">{NAV.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-link ${tab === id ? 'active' : ''}`} onClick={() => { setTab(id); setMobileNav(false); }}><Icon size={19} /><span>{label}</span><ChevronLeft size={15} className="nav-arrow" /></button>)}</nav>
        <div className="sidebar-bottom"><span className="free-label"><CheckCircle2 size={15} /> مجاني للتعلّم</span><button className="nav-link signout" onClick={signOut}><LogOut size={18} /><span>تسجيل الخروج</span></button></div>
      </aside>
      {mobileNav && <button className="nav-backdrop" aria-label="إغلاق القائمة" onClick={() => setMobileNav(false)} />}
      <main className="main-area">
        <header className="topbar"><button className="icon-btn mobile-menu" aria-label="فتح القائمة" onClick={() => setMobileNav(true)}><Menu /></button><div><span className="topbar-kicker">رحلتك نحو الفهم</span><h1>{NAV.find((item) => item.id === tab)?.label}</h1></div><div className="topbar-user"><span>{profile.full_name || session.user.email}</span><div className="avatar"><UserRound size={19} /></div></div></header>
        {notice && <div className="global-notice" role="status"><CircleHelp size={18} /><span>{notice}</span><button aria-label="إغلاق التنبيه" onClick={() => setNotice('')}><X size={16} /></button></div>}
        {tab === 'home' && <section className="page-content">
          <div className="welcome-banner"><div><p className="eyebrow light">أهلًا بك في رحلتك التعليمية</p><h2>{profile.full_name ? `أهلًا يا ${profile.full_name}` : 'أهلًا يا بطل!'}</h2><p>ماذا تريد أن تتعلّم اليوم؟ أنا هنا لأساعدك خطوة بخطوة.</p><button className="light-btn" onClick={() => setTab('tutor')}>اسأل المعلّم صفوت <ChevronLeft size={17} /></button></div><div className="welcome-art"><GraduationCap size={78} strokeWidth={1.3} /><Sparkles size={24} /></div></div>
          {!profile.grade_level && <button className="profile-reminder" onClick={() => setTab('profile')}><UserRound size={21} /><span><strong>لنبدأ بالتعرّف عليك</strong><small>أكمل صفك الدراسي حتى نوجّهك للمحتوى المناسب.</small></span><ChevronLeft size={18} /></button>}
          <div className="section-heading"><div><h2>ماذا سنفعل اليوم؟</h2><p>اختر نشاطًا يناسب وقتك وهدفك.</p></div></div>
          <div className="feature-grid">
            <button className="feature-card green" onClick={() => setTab('curriculum')}><span className="feature-icon"><BookOpen /></span><strong>تعلّم درسًا</strong><span>تصفّح المواد والدروس المتاحة.</span><b>استكشف <ChevronLeft size={15} /></b></button>
            <button className="feature-card orange" onClick={() => setTab('games')}><span className="feature-icon"><Play /></span><strong>العب وتدرّب</strong><span>تمارين قصيرة في الرياضيات والإنجليزية.</span><b>ابدأ اللعب <ChevronLeft size={15} /></b></button>
            <button className="feature-card purple" onClick={() => setTab('tutor')}><span className="feature-icon"><MessageCircle /></span><strong>اسأل سؤالًا</strong><span>اطلب شرحًا أو مساعدة في تمرين.</span><b>اسأل الآن <ChevronLeft size={15} /></b></button>
          </div>
          <div className="section-heading schedule-title"><div><h2>حصص اليوم</h2><p>جدولك الذي أضفته بنفسك.</p></div><button className="subtle-btn" onClick={() => setTab('profile')}>إدارة الجدول <ChevronLeft size={15} /></button></div>
          {todaySchedule.length ? <div className="schedule-list">{todaySchedule.map((entry) => <div className="schedule-row" key={entry.id}><div className="time-pill"><Clock3 size={15} />{entry.start_time.slice(0, 5)}</div><div><strong>{entry.subject_name}</strong><small>{entry.lesson_title || 'لم يُحدد عنوان الدرس'}</small></div><span className="today-dot" /></div>)}</div> : <div className="empty-state"><CalendarDays size={27} /><strong>لا توجد حصص مسجلة لهذا اليوم</strong><span>أضف جدولك الدراسي من صفحة «ملفي وجدولي» لتظهر حصصك هنا.</span><button className="subtle-btn" onClick={() => setTab('profile')}>إضافة حصص <ChevronLeft size={15} /></button></div>}
        </section>}
        {tab === 'curriculum' && <section className="page-content">
          <div className="page-intro"><div className="intro-icon"><BookOpen /></div><div><h2>المنهج اليمني</h2><p>اختر صفك الدراسي لمتابعة الدروس عند إتاحة محتواها المعتمد.</p></div></div>
          {lessons.length === 0 && <div className="notice-panel"><ShieldCheck size={21} /><div><strong>المحتوى الدراسي الرسمي</strong><p>لا توجد دروس معتمدة منشورة في قاعدة المحتوى بعد. لن نعرض عناوين أو حلولًا مختلقة على أنها من الكتاب المدرسي. يلزم رفع الكتب المعتمدة وفهرستها ومراجعة النص المستخرج قبل نشرها.</p></div></div>}
          <div className="section-heading"><div><h2>الصفوف الدراسية</h2><p>من الصف الأول الأساسي إلى الثالث الثانوي.</p></div></div>
          <div className="grade-grid">{GRADES.map((g) => <button className={profile.grade_level === g.value ? 'grade-card selected' : 'grade-card'} key={g.value} onClick={() => { setProfile((p) => ({ ...p, grade_level: g.value })); setSelectedLesson(null); setNotice('تم اختيار الصف. احفظ ملفك من صفحة «ملفي وجدولي» لتثبيته في حسابك.'); }}><GraduationCap size={23} /><span>{g.label}</span><small>{lessons.some((item) => String(item.grade_level) === g.value) ? 'توجد دروس معتمدة' : 'بانتظار اعتماد المحتوى'}</small></button>)}</div>
          {visibleLessons.length > 0 && <><div className="section-heading"><div><h2>الدروس المعتمدة</h2><p>محتوى منشور ومراجع من قاعدة المنهج.</p></div></div><div className="lesson-grid">{visibleLessons.map((item) => <button key={item.id} className={selectedLesson?.id === item.id ? 'lesson-card lesson-selected' : 'lesson-card'} onClick={() => setSelectedLesson(item)}><span>{item.subject_name}</span><strong>{item.lesson_title}</strong><small>{item.unit_title || 'وحدة غير محددة'}</small><b>عرض الدرس <ChevronLeft size={15} /></b></button>)}</div></>}
          {selectedLesson && <article className="lesson-detail"><div className="card-heading"><div><span className="lesson-subject">{selectedLesson.subject_name}</span><h3>{selectedLesson.lesson_title}</h3></div><button className="icon-btn" aria-label="إغلاق الدرس" onClick={() => setSelectedLesson(null)}><X size={19} /></button></div><p className="lesson-body">{selectedLesson.lesson_content || 'لم تتم إضافة نص الدرس بعد.'}</p><div className="lesson-source"><BookOpen size={16} /><span>المصدر: {selectedLesson.source_book}{selectedLesson.source_edition ? ` — ${selectedLesson.source_edition}` : ''}{selectedLesson.page_start ? ` — صفحة ${selectedLesson.page_start}${selectedLesson.page_end && selectedLesson.page_end !== selectedLesson.page_start ? `–${selectedLesson.page_end}` : ''}` : ''}</span></div></article>}
          <div className="section-heading"><div><h2>كيف نضيف الكتب؟</h2><p>خطوات تجهيز المنهج للمعلّم الذكي.</p></div></div>
          <ol className="steps-list"><li>رفع ملفات الكتب المدرسية الموثوقة وبيانات الطبعة.</li><li>استخراج النصوص مع الحفاظ على أرقام الصفحات والعناوين.</li><li>مراجعة المحتوى ثم ربط كل تمرين بالدرس الصحيح.</li><li>اختبار الإجابات قبل إتاحتها للطلاب.</li></ol>
        </section>}
        {tab === 'tutor' && <section className="page-content">
          <div className="page-intro"><div className="intro-icon purple-bg"><MessageCircle /></div><div><h2>اسأل المعلّم صفوت</h2><p>اكتب سؤالك أو المسألة التي تحتاج إلى فهمها.</p></div></div>
          <div className="tutor-card"><div className="tutor-header"><div className="avatar tutor-avatar"><GraduationCap size={23} /></div><div><strong>المعلّم صفوت</strong><small><span className="status-dot" /> مساعدك الدراسي</small></div></div><div className="tutor-message"><Sparkles size={20} /><p>أرسل سؤالك، وسأحاول شرح الفكرة والخطوات المناسبة لصفك. يجب تفعيل خدمة الذكاء الاصطناعي وربط الكتب قبل تقديم إجابات تعليمية مباشرة.</p></div>{answer && <div className="answer-box"><strong>الرد</strong><p>{answer}</p></div>}<form className="question-form" onSubmit={askTutor}><label htmlFor="student-question">ما الذي تريد أن تفهمه؟</label><textarea id="student-question" rows={4} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="اكتب السؤال أو التمرين هنا…" required /><div className="question-footer"><span>الصف: {GRADES.find((g) => g.value === profile.grade_level)?.label || 'لم تحدد صفك بعد'}</span><button className="primary-btn" type="submit" disabled={busy || !question.trim()}>{busy ? 'جارٍ الإرسال…' : 'إرسال السؤال'} <Send size={16} /></button></div></form></div>
          <div className="notice-panel"><CircleHelp size={20} /><div><strong>دقة الإجابات مهمة</strong><p>لن تُعرض إجابة مولدة إلا بعد تفعيل الخدمة. عند ربط الكتب، ينبغي إظهار المصدر ورقم الصفحة متى توفرا، وشرح الحل بدل الاكتفاء بالنتيجة.</p></div></div>
        </section>}
        {tab === 'games' && <section className="page-content">
          <div className="page-intro"><div className="intro-icon orange-bg"><Play /></div><div><h2>الألعاب والتدريبات</h2><p>تدرّب قليلًا كل يوم، فالخطوات الصغيرة تصنع فرقًا.</p></div></div>
          <div className="games-grid">
            <article className="game-card"><div className="game-top"><span className="game-icon math-icon">＋</span><span className="level-tag">رياضيات</span></div><h3>تحدّي الجمع</h3><p>اجمع الرقمين واختر الإجابة الصحيحة.</p><div className="math-question">{mathA} <span>+</span> {mathB} <span>=</span> ؟</div><form className="math-form" onSubmit={checkMath}><input aria-label="إجابة مسألة الجمع" type="number" value={mathAnswer} onChange={(e) => setMathAnswer(e.target.value)} required /><button className="primary-btn" type="submit">تحقّق</button></form>{gameFeedback && <p className={gameFeedback.startsWith('أحسنت') ? 'feedback good' : 'feedback'}>{gameFeedback}</p>}<div className="game-bottom"><span>إجابات صحيحة في هذه الجلسة: {mathScore}</span><button className="text-btn" onClick={nextMath}>سؤال جديد</button></div></article>
            <article className="game-card"><div className="game-top"><span className="game-icon english-icon"><Languages /></span><span className="level-tag">إنجليزي</span></div><h3>ما معنى الكلمة؟</h3><p>اختر المعنى العربي للكلمة الإنجليزية.</p><div className="word-question">{WORDS[wordIndex].en}</div><div className="word-options">{wordChoices.map((choice) => <button key={choice} onClick={() => chooseWord(choice)}>{choice}</button>)}</div>{wordFeedback && <p className={wordFeedback.startsWith('صحيح') ? 'feedback good' : 'feedback'}>{wordFeedback}</p>}<div className="game-bottom"><span>مفردات أساسية</span><button className="text-btn" onClick={() => setWordIndex((i) => (i + 1) % WORDS.length)}>كلمة جديدة</button></div></article>
          </div>
          <p className="small-muted">هذه أنشطة تدريبية مستقلة وليست أسئلة منسوبة إلى كتاب مدرسي. لا يُحفظ سجل النتائج السحابي قبل تفعيل قاعدة البيانات.</p>
        </section>}
        {tab === 'progress' && <section className="page-content"><div className="page-intro"><div className="intro-icon"><Star /></div><div><h2>تقدّمي الدراسي</h2><p>نتابع ما أنجزته بعد تفعيل حفظ المحاولات.</p></div></div><div className="notice-panel"><ShieldCheck size={21} /><div><strong>سجل التقدم</strong><p>لا توجد نتائج دراسية مسجلة في حسابك بعد. لن نعرض درجات افتراضية. ستظهر هنا نتائج الاختبارات والدروس المكتملة بعد ربط وحدات التعلّم والتقييم.</p></div></div><div className="progress-next"><CheckCircle2 size={24} /><div><strong>ابدأ بخطوة بسيطة</strong><p>أكمل ملفك الدراسي وأضف جدول الحصص، ثم اختر درسًا أو تدريبًا مناسبًا.</p></div><button className="subtle-btn" onClick={() => setTab('profile')}>إكمال الملف <ChevronLeft size={15} /></button></div></section>}
        {tab === 'profile' && <section className="page-content">
          <div className="page-intro"><div className="intro-icon"><UserRound /></div><div><h2>ملفي وجدولي</h2><p>حدّث بياناتك الدراسية وجدول الحصص الأسبوعي.</p></div></div>
          <form className="profile-card" onSubmit={saveProfile}><div className="card-heading"><h3>الملف الدراسي</h3><span className="secure-tag"><ShieldCheck size={14} /> حسابك الخاص</span></div><div className="form-grid"><label>اسم الطالب<input required minLength={2} value={profile.full_name} onChange={(e) => setProfile((p) => ({ ...p, full_name: e.target.value }))} /></label><label>الصف الدراسي<select required value={profile.grade_level} onChange={(e) => setProfile((p) => ({ ...p, grade_level: e.target.value }))}><option value="">اختر الصف</option>{GRADES.map((g) => <option value={g.value} key={g.value}>{g.label}</option>)}</select></label><label>المسار الثانوي<select value={profile.academic_track || ''} onChange={(e) => setProfile((p) => ({ ...p, academic_track: e.target.value || null }))}><option value="">لا ينطبق / لم يحدد</option><option value="scientific">علمي</option><option value="literary">أدبي</option></select></label><label>المدرسة (اختياري)<input value={profile.school_name || ''} onChange={(e) => setProfile((p) => ({ ...p, school_name: e.target.value }))} /></label></div><button className="primary-btn" type="submit" disabled={busy}>{busy ? 'جارٍ الحفظ…' : 'حفظ الملف الدراسي'} <CheckCircle2 size={17} /></button></form>
          <div className="profile-card"><div className="card-heading"><div><h3>جدول الحصص الأسبوعي</h3><p>أضف حصصك الفعلية لتظهر في لوحة اليوم.</p></div></div><form className="timetable-form" onSubmit={addTimetableEntry}><label>اليوم<select value={day} onChange={(e) => setDay(e.target.value)}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></label><label>المادة<input required value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="مثال: الرياضيات" /></label><label>عنوان الدرس (اختياري)<input value={lesson} onChange={(e) => setLesson(e.target.value)} placeholder="عنوان الحصة" /></label><label>وقت الحصة<input type="time" required value={time} onChange={(e) => setTime(e.target.value)} /></label><button className="primary-btn" type="submit" disabled={busy}><CalendarDays size={17} /> إضافة الحصة</button></form>
            {timetable.length ? <div className="timetable-list">{DAYS.map((d, i) => { const entries = timetable.filter((entry) => entry.day_of_week === i); return entries.length ? <div className="day-group" key={d}><h4>{d}</h4>{entries.map((entry) => <div className="timetable-entry" key={entry.id}><span className="time-pill">{entry.start_time.slice(0, 5)}</span><span><strong>{entry.subject_name}</strong><small>{entry.lesson_title || 'بدون عنوان درس'}</small></span><button className="icon-btn danger" aria-label={`حذف حصة ${entry.subject_name}`} onClick={() => void removeTimetableEntry(entry.id)}><X size={17} /></button></div>)}</div> : null; })}</div> : <div className="empty-inline"><CalendarDays size={20} /><span>لم تضف حصصًا بعد.</span></div>}
          </div>
        </section>}
        <footer className="app-footer"><span>المعلّم صفوت © رفيق الطالب اليمني</span><span><ShieldCheck size={14} /> نحترم خصوصية بياناتك</span></footer>
      </main>
    </div>
  );
}

export default App;