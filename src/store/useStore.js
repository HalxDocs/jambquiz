import { useState, useEffect } from 'react'

const SUBJECTS = [
  'Mathematics',
  'English Language',
  'Physics',
  'Chemistry',
  'Biology',
  'Economics',
  'Government',
  'Literature in English',
  'Geography',
  'Commerce',
  'Accounting',
  'Agricultural Science',
  'Further Mathematics',
  'Civic Education',
  'Christian Religious Studies',
  'Islamic Religious Studies',
]

const WEEKS = ['Week 1', 'Week 2', 'Week 3', 'Week 4']

function load(key, fallback) {
  try {
    const v = localStorage.getItem(key)
    return v ? JSON.parse(v) : fallback
  } catch {
    return fallback
  }
}

function save(key, value) {
  localStorage.setItem(key, JSON.stringify(value))
}

export { SUBJECTS, WEEKS, load, save }