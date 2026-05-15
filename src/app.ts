import express from 'express'
import cors from 'cors'
import helmet from 'helmet'
import morgan from 'morgan'
import { authRoutes } from './modules/auth/index.js'
import { errorMiddleware } from './shared/middleware/error.middleware.js'

const app = express()

app.use(cors())
app.use(helmet())
app.use(morgan('dev'))
app.use(express.json())

app.get('/', (_req, res) => {
  res.json({
    success: true,
    message: 'Katlog API Running',
  })
})

app.use('/api/auth', authRoutes)

app.use(errorMiddleware)

export default app
