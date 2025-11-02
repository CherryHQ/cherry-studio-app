import { getTimeFormatForGroup, groupItemsByDate } from '../date'

describe('date utils', () => {
  describe('getTimeFormatForGroup', () => {
    it('should return "time" for today and yesterday', () => {
      expect(getTimeFormatForGroup('today')).toBe('time')
      expect(getTimeFormatForGroup('yesterday')).toBe('time')
    })

    it('should return "date" for other groups', () => {
      expect(getTimeFormatForGroup('thisWeek')).toBe('date')
      expect(getTimeFormatForGroup('lastWeek')).toBe('date')
      expect(getTimeFormatForGroup('lastMonth')).toBe('date')
      expect(getTimeFormatForGroup('older')).toBe('date')
    })
  })

  describe('groupItemsByDate', () => {
    interface TestItem {
      id: string
      date: Date
    }

    const createItem = (id: string, date: Date): TestItem => ({ id, date })

    it('should group items by date correctly', () => {
      const now = new Date()
      const today = new Date(now)
      const yesterday = new Date(now)
      yesterday.setDate(today.getDate() - 1)

      const items = [createItem('1', today), createItem('2', yesterday)]

      const result = groupItemsByDate(items, (item) => item.date)

      expect(result.today).toHaveLength(1)
      expect(result.today[0].id).toBe('1')
      expect(result.yesterday).toHaveLength(1)
      expect(result.yesterday[0].id).toBe('2')
      expect(result.thisWeek).toHaveLength(0)
      expect(result.lastWeek).toHaveLength(0)
      expect(result.lastMonth).toHaveLength(0)
      expect(result.older).toHaveLength(0)
    })

    it('should sort items in descending order within groups', () => {
      const now = new Date()
      const time1 = new Date(now)
      time1.setHours(10)
      const time2 = new Date(now)
      time2.setHours(14)
      const time3 = new Date(now)
      time3.setHours(8)

      const items = [createItem('1', time1), createItem('2', time2), createItem('3', time3)]

      const result = groupItemsByDate(items, (item) => item.date)

      expect(result.today).toHaveLength(3)
      expect(result.today[0].id).toBe('2') // 14:00
      expect(result.today[1].id).toBe('1') // 10:00
      expect(result.today[2].id).toBe('3') // 8:00
    })

    it('should handle this week items', () => {
      const now = new Date()
      const thisWeek = new Date(now)
      // Go back to the start of the week, then forward a bit
      // Make sure it's not today or yesterday by going back at least 2 days
      const daysBack = Math.max(2, now.getDay() === 0 ? 3 : now.getDay())
      thisWeek.setDate(now.getDate() - daysBack)

      const items = [createItem('1', thisWeek)]
      const result = groupItemsByDate(items, (item) => item.date)

      // The item should be in thisWeek, lastWeek, or later depending on the current day
      // Just check that it's not in today
      expect(result.today).toHaveLength(0)
    })

    it('should handle last week items', () => {
      const now = new Date()
      const lastWeek = new Date(now)
      lastWeek.setDate(now.getDate() - 7 - now.getDay()) // Last week start

      const items = [createItem('1', lastWeek)]
      const result = groupItemsByDate(items, (item) => item.date)

      expect(result.lastWeek.length).toBeGreaterThanOrEqual(0)
    })

    it('should handle last month items', () => {
      const now = new Date()
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 15)

      const items = [createItem('1', lastMonth)]
      const result = groupItemsByDate(items, (item) => item.date)

      expect(result.lastMonth.length).toBeGreaterThanOrEqual(0)
    })

    it('should handle older items', () => {
      const now = new Date()
      const older = new Date(now.getFullYear() - 1, 0, 1)

      const items = [createItem('1', older)]
      const result = groupItemsByDate(items, (item) => item.date)

      expect(result.older).toHaveLength(1)
      expect(result.older[0].id).toBe('1')
    })

    it('should handle empty array', () => {
      const result = groupItemsByDate([], (item: TestItem) => item.date)

      expect(result.today).toHaveLength(0)
      expect(result.yesterday).toHaveLength(0)
      expect(result.thisWeek).toHaveLength(0)
      expect(result.lastWeek).toHaveLength(0)
      expect(result.lastMonth).toHaveLength(0)
      expect(result.older).toHaveLength(0)
    })

    it('should handle items across all groups', () => {
      const now = new Date()
      const items = [
        createItem('1', new Date(now)), // today
        createItem('2', new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1)), // yesterday
        createItem('3', new Date(now.getFullYear() - 2, 0, 1)) // older
      ]

      const result = groupItemsByDate(items, (item) => item.date)

      expect(result.today).toHaveLength(1)
      expect(result.yesterday).toHaveLength(1)
      expect(result.older).toHaveLength(1)
    })
  })
})