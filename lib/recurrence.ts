// 循環項目頻率計算（純函式，不碰 DB，邏輯可獨立驗證）
// 你的決定:完整頻率—每週/雙週/每月第N號/每月第K個週幾。
//
// 設計原則:給定「某一週的起訖」與一個循環項目,算出
// 這個循環項目在這週「應該排在哪一天」(或不排)。
// 回傳 Date | null（null=這週不該排）。
//
// 週期鍵 period_key:用於判斷「這週期是否已生成/已略過」。
// weekly/biweekly 用 ISO 週鍵（YYYY-Www）;monthly 用月鍵（YYYY-MM）。

export type Frequency =
  | 'weekly'
  | 'biweekly'
  | 'monthly_date'
  | 'monthly_weekday'

export type RecurringRule = {
  id: string
  name: string
  frequency: string
  weekday: number | null // 0=日..6=六
  anchor_date: string | null // biweekly 基準
  day_of_month: number | null // monthly_date
  week_of_month: number | null // monthly_weekday(1..5,5=最後)
  time_start: string | null
  time_end: string | null
  leverage: string | null
}

// 取某日期所在週的週一（ISO 週起始）
function mondayOf(d: Date): Date {
  const x = new Date(d)
  const day = (x.getDay() + 6) % 7 // 週一=0
  x.setDate(x.getDate() - day)
  x.setHours(0, 0, 0, 0)
  return x
}

// ISO 週鍵 YYYY-Www
export function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - dayNum + 3)
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4))
  const week =
    1 +
    Math.round(
      ((date.getTime() - firstThursday.getTime()) / 86400000 -
        3 +
        ((firstThursday.getUTCDay() + 6) % 7)) /
        7
    )
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}

// 月鍵 YYYY-MM
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// 兩個日期相差幾週（以週一對齊）
function weeksBetween(a: Date, b: Date): number {
  const ma = mondayOf(a).getTime()
  const mb = mondayOf(b).getTime()
  return Math.round((mb - ma) / (7 * 86400000))
}

// 主函式:給定「該週的週一」與規則,回傳這週期該排的日期 + 週期鍵,或 null
export function occurrenceInWeek(
  rule: RecurringRule,
  weekMonday: Date
): { date: Date; periodKey: string } | null {
  const wd = rule.weekday // 0=日..6=六

  // 該週某個 weekday 對應的實際日期
  function dateForWeekday(weekday: number): Date {
    // weekMonday 是週一;weekday 0=日 → 該週日是週一+6
    const offset = (weekday + 6) % 7 // 週一=0..週日=6
    const d = new Date(weekMonday)
    d.setDate(d.getDate() + offset)
    d.setHours(0, 0, 0, 0)
    return d
  }

  switch (rule.frequency as Frequency) {
    case 'weekly': {
      if (wd == null) return null
      const date = dateForWeekday(wd)
      return { date, periodKey: isoWeekKey(date) }
    }

    case 'biweekly': {
      if (wd == null || !rule.anchor_date) return null
      const anchor = new Date(rule.anchor_date)
      const diff = weeksBetween(anchor, weekMonday)
      // 偶數週差才排（與基準同相位）
      if (diff % 2 !== 0) return null
      const date = dateForWeekday(wd)
      return { date, periodKey: isoWeekKey(date) }
    }

    case 'monthly_date': {
      // 每月第 N 號:檢查這週是否含有該月的第 N 號
      if (!rule.day_of_month) return null
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekMonday)
        d.setDate(d.getDate() + i)
        if (d.getDate() === rule.day_of_month) {
          return { date: d, periodKey: monthKey(d) }
        }
      }
      return null
    }

    case 'monthly_weekday': {
      // 每月第 K 個週幾:檢查這週是否含該月第 K 個 weekday
      if (wd == null || !rule.week_of_month) return null
      const date = dateForWeekday(wd)
      // 該日期是當月第幾個同 weekday？
      const nth = Math.ceil(date.getDate() / 7)
      const isLast =
        rule.week_of_month === 5 && // 5 視為「最後一個」
        date.getMonth() !==
          new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7).getMonth()
      if (nth === rule.week_of_month || isLast) {
        return { date, periodKey: monthKey(date) }
      }
      return null
    }

    default:
      return null
  }
}
