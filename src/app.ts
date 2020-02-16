import express from 'express'
import 'express-async-errors'
import helmet from 'helmet'
import morgan from 'morgan'
import { config } from './config'
import { container } from './container'
import { Router } from './router'

container.initializeDatabase()

const app = express()

app.use(express.json())
app.use(morgan('dev'))
app.use(helmet())
app.use('/', Router)

app.listen(config.PORT, () => console.log(`listening on port ${config.PORT}`))