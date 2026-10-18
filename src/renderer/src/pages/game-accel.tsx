import BasePage from '@renderer/components/base/base-page'
import { Card, CardBody } from '@heroui/react'
import React from 'react'
import { useTranslation } from 'react-i18next'
import { IoGameController } from 'react-icons/io5'

const GameAccel: React.FC = () => {
  const { t } = useTranslation()

  return (
    <BasePage title={t('gameAccel.title')}>
      <div data-testid="game-accel-page" className="p-3">
        <Card>
          <CardBody className="gap-4 p-6">
            <div className="flex items-start gap-4">
              <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                <IoGameController className="text-3xl" />
              </div>
              <div className="min-w-0">
                <h2 className="text-lg font-bold">{t('gameAccel.title')}</h2>
                <p className="text-small text-default-500">{t('gameAccel.subtitle')}</p>
              </div>
            </div>
            <p data-testid="game-accel-placeholder" className="text-small text-default-500">
              {t('gameAccel.placeholder')}
            </p>
          </CardBody>
        </Card>
      </div>
    </BasePage>
  )
}

export default GameAccel
