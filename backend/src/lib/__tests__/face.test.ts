import { describe, expect, it } from 'vitest'
import {
  bestFaceMatchInGallery,
  cosineSimilarity,
  EMBEDDING_DIM,
  ENROLL_QUALITY,
  isValidEmbedding,
  matchAgainstGallery,
  passesEnrollQuality,
  type FaceQuality,
} from '../face.js'

function unitVector(dim: number, index: number): number[] {
  const v = new Array(dim).fill(0)
  v[index] = 1
  return v
}

function face(overrides: Partial<FaceQuality> = {}): FaceQuality {
  return {
    embedding: unitVector(EMBEDDING_DIM, 0),
    det_score: 0.9,
    yaw: 0,
    pitch: 0,
    blur_var: 100,
    brightness: 128,
    face_px: 120,
    bbox: [0, 0, 100, 100],
    ...overrides,
  }
}

describe('cosineSimilarity', () => {
  it('returns 1 for identical unit vectors', () => {
    const v = unitVector(4, 2)
    expect(cosineSimilarity(v, v)).toBe(1)
  })

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity(unitVector(4, 0), unitVector(4, 1))).toBe(0)
  })

  it('returns 0 when embedding lengths differ', () => {
    expect(cosineSimilarity([1, 0], [1, 0, 0])).toBe(0)
  })
})

describe('matchAgainstGallery', () => {
  it('picks the gallery vector with highest similarity', () => {
    const probe = unitVector(8, 3)
    const gallery = [unitVector(8, 0), unitVector(8, 3), unitVector(8, 5)]
    expect(matchAgainstGallery(probe, gallery)).toEqual({ bestSim: 1, bestIdx: 1 })
  })

  it('returns sentinel values for an empty gallery', () => {
    expect(matchAgainstGallery(unitVector(4, 0), [])).toEqual({ bestSim: -1, bestIdx: -1 })
  })
})

describe('bestFaceMatchInGallery', () => {
  it('finds the global best match across multiple probe faces', () => {
    const probes = [unitVector(8, 1), unitVector(8, 4)]
    const gallery = [unitVector(8, 4), unitVector(8, 7)]
    expect(bestFaceMatchInGallery(probes, gallery)).toEqual({
      faceIndex: 1,
      galleryIndex: 0,
      sim: 1,
    })
  })
})

describe('isValidEmbedding', () => {
  it('accepts a 512-dimensional numeric array', () => {
    expect(isValidEmbedding(unitVector(EMBEDDING_DIM, 0))).toBe(true)
  })

  it('rejects wrong length or non-array values', () => {
    expect(isValidEmbedding(unitVector(EMBEDDING_DIM - 1, 0))).toBe(false)
    expect(isValidEmbedding(null)).toBe(false)
    expect(isValidEmbedding('not-an-array')).toBe(false)
  })
})

describe('passesEnrollQuality', () => {
  it('accepts a face that meets all thresholds', () => {
    expect(passesEnrollQuality(face())).toEqual({ ok: true })
  })

  it('rejects low detection score', () => {
    expect(passesEnrollQuality(face({ det_score: 0.5 }))).toEqual({
      ok: false,
      reason: 'low_det_score',
    })
  })

  it('rejects blurry, poorly angled, badly lit, or wrong-dimension embeddings', () => {
    expect(passesEnrollQuality(face({ blur_var: 10 }))).toMatchObject({
      ok: false,
      reason: 'blurry',
    })
    expect(passesEnrollQuality(face({ yaw: 0.9 }))).toMatchObject({
      ok: false,
      reason: 'too_much_yaw',
    })
    expect(passesEnrollQuality(face({ pitch: -0.5 }))).toMatchObject({
      ok: false,
      reason: 'too_much_pitch',
    })
    expect(passesEnrollQuality(face({ brightness: 10 }))).toMatchObject({
      ok: false,
      reason: 'too_dark',
    })
    expect(passesEnrollQuality(face({ brightness: 250 }))).toMatchObject({
      ok: false,
      reason: 'too_bright',
    })
    expect(
      passesEnrollQuality(face({ embedding: unitVector(EMBEDDING_DIM - 1, 0) }), ENROLL_QUALITY)
    ).toMatchObject({ ok: false, reason: 'bad_embedding_dim' })
  })
})
