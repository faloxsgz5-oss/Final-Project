import type {InstitutionType, SchoolTerm} from '@/types/institution';

function bangkokParts(value: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
  }).formatToParts(value);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return {day: get('day'), month: get('month'), year: get('year')};
}

function dateKey(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function suggestedSchoolTerm(reference = new Date()): SchoolTerm {
  const {day, month} = bangkokParts(reference);
  return month >= 11 || month < 3 || (month === 3 && day <= 15) ? 2 : 1;
}

export function defaultTermDates(
  institutionType: InstitutionType,
  term: SchoolTerm = 1,
  reference = new Date(),
) {
  const current = bangkokParts(reference);
  if (institutionType === 'high-school') {
    if (term === 1) {
      const year = current.month > 10 || (current.month === 10 && current.day > 15)
        ? current.year + 1
        : current.year;
      return {semesterStart: dateKey(year, 5, 15), semesterEnd: dateKey(year, 10, 15)};
    }

    const startYear = current.month < 3 || (current.month === 3 && current.day <= 15)
      ? current.year - 1
      : current.year;
    return {semesterStart: dateKey(startYear, 11, 1), semesterEnd: dateKey(startYear + 1, 3, 15)};
  }

  const semesterStart = dateKey(current.year, current.month, current.day);
  const end = new Date(`${semesterStart}T12:00:00+07:00`);
  end.setUTCDate(end.getUTCDate() + 16 * 7);
  const endParts = bangkokParts(end);
  return {semesterStart, semesterEnd: dateKey(endParts.year, endParts.month, endParts.day)};
}
