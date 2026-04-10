<template>
  <div class="space-y-5">
    <Card>
      <CardContent>
        <PageHeader title="Системные настройки" description="Управление ключевыми модулями и их параметрами">
          <template #actions>
            <div v-if="activeTab === 'modules' && canManageSettings" class="header-actions">
              <Button variant="secondary" :disabled="moduleLoading || moduleSaving" @click="loadModuleSettings">
                <Spinner v-if="moduleLoading" class="h-4 w-4" />
                <RefreshCcw v-else :size="16" />
                Сбросить
              </Button>
              <Button :disabled="moduleLoading || moduleSaving" @click="saveModuleSettings">
                <Spinner v-if="moduleSaving" class="h-4 w-4" />
                <Save v-else :size="16" />
                {{ moduleSaving ? "Сохранение..." : "Сохранить" }}
              </Button>
            </div>
            <div v-else-if="activeTab === 'maps' && canManageSettings" class="header-actions">
              <Button variant="secondary" :disabled="moduleLoading || moduleSaving || mapsTesting" @click="loadModuleSettings">
                <Spinner v-if="moduleLoading" class="h-4 w-4" />
                <RefreshCcw v-else :size="16" />
                Сбросить
              </Button>
              <Button variant="secondary" :disabled="moduleLoading || moduleSaving || mapsTesting" @click="testMapsSettings">
                <Spinner v-if="mapsTesting" class="h-4 w-4" />
                <SendHorizontal v-else :size="16" />
                {{ mapsTesting ? "Проверка..." : "Тест Яндекс API" }}
              </Button>
              <Button :disabled="moduleLoading || moduleSaving || mapsTesting" @click="saveMapSettings">
                <Spinner v-if="moduleSaving" class="h-4 w-4" />
                <Save v-else :size="16" />
                {{ moduleSaving ? "Сохранение..." : "Сохранить" }}
              </Button>
            </div>
            <div v-else-if="activeTab === 'appearance' && canManageSettings" class="header-actions">
              <Button variant="secondary" :disabled="moduleLoading || moduleSaving" @click="loadModuleSettings">
                <Spinner v-if="moduleLoading" class="h-4 w-4" />
                <RefreshCcw v-else :size="16" />
                Сбросить
              </Button>
              <Button :disabled="moduleLoading || moduleSaving" @click="saveAppearanceSettings">
                <Spinner v-if="moduleSaving" class="h-4 w-4" />
                <Save v-else :size="16" />
                {{ moduleSaving ? "Сохранение..." : "Сохранить" }}
              </Button>
            </div>
            <div v-else-if="activeTab === 'analytics' && canManageSettings" class="header-actions">
              <Button variant="secondary" :disabled="moduleLoading || moduleSaving || analyticsTesting" @click="loadModuleSettings">
                <Spinner v-if="moduleLoading" class="h-4 w-4" />
                <RefreshCcw v-else :size="16" />
                Сбросить
              </Button>
              <Button variant="secondary" :disabled="moduleLoading || moduleSaving || analyticsTesting" @click="testAnalyticsSettings">
                <Spinner v-if="analyticsTesting" class="h-4 w-4" />
                <SendHorizontal v-else :size="16" />
                {{ analyticsTesting ? "Проверка..." : "Тест конфигурации" }}
              </Button>
              <Button :disabled="moduleLoading || moduleSaving || analyticsTesting" @click="saveAnalyticsSettings">
                <Spinner v-if="moduleSaving" class="h-4 w-4" />
                <Save v-else :size="16" />
                {{ moduleSaving ? "Сохранение..." : "Сохранить" }}
              </Button>
            </div>
            <div v-else-if="activeTab === 'start-message' && canManageSettings" class="header-actions">
              <Button variant="secondary" :disabled="telegramLoading || telegramSaving || telegramTesting" @click="loadTelegramStartSettings">
                <Spinner v-if="telegramLoading" class="h-4 w-4" />
                <RefreshCcw v-else :size="16" />
                Сбросить
              </Button>
              <Button variant="secondary" :disabled="telegramLoading || telegramSaving || telegramTesting" @click="sendTelegramStartTest">
                <Spinner v-if="telegramTesting" class="h-4 w-4" />
                <SendHorizontal v-else :size="16" />
                {{ telegramTesting ? "Отправка..." : "Тест" }}
              </Button>
              <Button :disabled="telegramLoading || telegramSaving || telegramTesting" @click="saveTelegramStartSettings">
                <Spinner v-if="telegramSaving" class="h-4 w-4" />
                <Save v-else :size="16" />
                {{ telegramSaving ? "Сохранение..." : "Сохранить" }}
              </Button>
            </div>
            <div v-else-if="activeTab === 'order-notifications' && canManageSettings" class="header-actions">
              <Button
                variant="secondary"
                :disabled="telegramLoading || telegramSaving || telegramOrderTesting || telegramCitiesLoading"
                @click="loadTelegramOrderSettings"
              >
                <Spinner v-if="telegramLoading || telegramCitiesLoading" class="h-4 w-4" />
                <RefreshCcw v-else :size="16" />
                Сбросить
              </Button>
              <Button
                variant="secondary"
                :disabled="telegramLoading || telegramSaving || telegramOrderTesting || telegramCitiesLoading"
                @click="sendTelegramOrderTest"
              >
                <Spinner v-if="telegramOrderTesting" class="h-4 w-4" />
                <SendHorizontal v-else :size="16" />
                {{ telegramOrderTesting ? "Отправка..." : "Тест" }}
              </Button>
              <Button :disabled="telegramLoading || telegramSaving || telegramOrderTesting || telegramCitiesLoading" @click="saveTelegramOrderSettings">
                <Spinner v-if="telegramSaving" class="h-4 w-4" />
                <Save v-else :size="16" />
                {{ telegramSaving ? "Сохранение..." : "Сохранить" }}
              </Button>
            </div>
          </template>
        </PageHeader>
      </CardContent>
    </Card>

    <Tabs v-model="activeTab">
      <div class="overflow-x-auto pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <TabsList class="inline-flex min-w-max whitespace-nowrap">
          <TabsTrigger v-for="tab in tabs" :key="tab.value" :value="tab.value">{{ tab.label }}</TabsTrigger>
        </TabsList>
      </div>
      <TabsContent value="modules" class="space-y-4">
        <Card v-if="moduleLoading">
          <CardContent class="space-y-3 pt-6">
            <Skeleton class="h-4 w-56" />
            <Skeleton class="h-14 w-full" />
            <Skeleton class="h-14 w-full" />
            <Skeleton class="h-14 w-full" />
          </CardContent>
        </Card>
        <Card v-else-if="moduleGroups.length">
          <CardHeader>
            <CardTitle>Модули</CardTitle>
            <CardDescription>Управление состоянием сервисных блоков</CardDescription>
          </CardHeader>
          <CardContent class="pt-0">
            <div class="space-y-4">
              <div v-for="group in moduleGroups" :key="group.name" class="space-y-4">
                <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {{ group.name }}
                </div>
                <div class="space-y-2.5">
                  <div
                    v-for="item in group.items"
                    :key="item.key"
                    class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-background px-3 py-2.5"
                  >
                    <div class="min-w-0">
                      <div class="text-sm font-semibold text-foreground">{{ item.label }}</div>
                      <div class="text-xs text-muted-foreground">{{ item.description }}</div>
                    </div>
                    <div class="w-36">
                      <Select v-if="item.type === 'boolean' || typeof moduleForm[item.key] === 'boolean'" v-model="moduleForm[item.key]">
                        <SelectTrigger class="w-full">
                          <SelectValue placeholder="Выберите статус" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem :value="true">Включено</SelectItem>
                          <SelectItem :value="false">Выключено</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        v-else-if="item.type === 'string'"
                        v-model="moduleForm[item.key]"
                        type="text"
                        autocomplete="off"
                        autocapitalize="none"
                        autocorrect="off"
                        spellcheck="false"
                      />
                      <Input
                        v-else
                        v-model.number="moduleForm[item.key]"
                        type="number"
                        step="1"
                        min="0"
                        @change="normalizeInteger(moduleForm, item.key)"
                      />
                    </div>
                  </div>
                  <div
                    v-if="group.name === 'Лояльность'"
                    class="rounded-xl border border-dashed border-border/60 bg-muted/30 px-4 py-3 text-xs text-muted-foreground"
                  >
                    Параметры уровней настраиваются на отдельной странице «Уровни лояльности». Здесь управляются только системные флаги.
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card v-else>
          <CardContent class="py-8 text-center text-sm text-muted-foreground">Настройки не найдены</CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="maps" class="space-y-4">
        <Card v-if="moduleLoading">
          <CardContent class="space-y-3 pt-6">
            <Skeleton class="h-4 w-56" />
            <Skeleton class="h-14 w-full" />
            <Skeleton class="h-14 w-full" />
            <Skeleton class="h-14 w-full" />
          </CardContent>
        </Card>
        <Card v-else-if="mapGroups.length">
          <CardHeader>
            <CardTitle>Карты и геокодинг</CardTitle>
            <CardDescription>Ключи API и параметры локализации карт</CardDescription>
          </CardHeader>
          <CardContent class="space-y-4 pt-0">
            <div class="space-y-4">
              <div v-for="group in mapGroups" :key="`maps-${group.name}`" class="space-y-4">
                <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {{ group.name }}
                </div>
                <div class="space-y-2.5">
                  <div
                    v-for="item in group.items"
                    :key="item.key"
                    class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-background px-3 py-2.5"
                  >
                    <div class="min-w-0">
                      <div class="text-sm font-semibold text-foreground">{{ item.label }}</div>
                      <div class="text-xs text-muted-foreground">{{ item.description }}</div>
                    </div>
                    <div class="w-52">
                      <Input
                        v-if="item.type === 'string'"
                        v-model="mapForm[item.key]"
                        type="text"
                        autocomplete="off"
                        autocapitalize="none"
                        autocorrect="off"
                        spellcheck="false"
                      />
                      <Input
                        v-else
                        v-model.number="mapForm[item.key]"
                        type="number"
                        step="1"
                        min="0"
                        @change="normalizeInteger(mapForm, item.key)"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card v-else>
          <CardContent class="py-8 text-center text-sm text-muted-foreground">Настройки карт не найдены</CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="appearance" class="space-y-4">
        <Card v-if="moduleLoading">
          <CardContent class="space-y-3 pt-6">
            <Skeleton class="h-4 w-56" />
            <Skeleton class="h-14 w-full" />
            <Skeleton class="h-14 w-full" />
          </CardContent>
        </Card>
        <Card v-else-if="appearanceGroups.length">
          <CardHeader>
            <CardTitle>Оформление меню</CardTitle>
            <CardDescription>Управление бейджами карточек и раскладкой в Mini App</CardDescription>
          </CardHeader>
          <CardContent class="pt-0">
            <div class="space-y-4">
              <div v-for="group in appearanceGroups" :key="`appearance-${group.name}`" class="space-y-4">
                <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {{ group.name }}
                </div>
                <div class="space-y-2.5">
                  <div
                    v-for="item in group.items"
                    :key="item.key"
                    class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-background px-3 py-2.5"
                  >
                    <div class="min-w-0">
                      <div class="text-sm font-semibold text-foreground">{{ item.label }}</div>
                      <div class="text-xs text-muted-foreground">{{ item.description }}</div>
                    </div>
                    <div class="w-52">
                      <Select
                        v-if="item.key === 'menu_cards_layout'"
                        v-model="appearanceForm[item.key]"
                      >
                        <SelectTrigger class="w-full">
                          <SelectValue placeholder="Выберите тип карточек" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="horizontal">Горизонтально (1 в ряд)</SelectItem>
                          <SelectItem value="vertical">Вертикально (2 в ряд)</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select
                        v-else-if="item.key === 'site_currency'"
                        v-model="appearanceForm[item.key]"
                      >
                        <SelectTrigger class="w-full">
                          <SelectValue placeholder="Выберите валюту" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="RUB">Рубли (RUB)</SelectItem>
                          <SelectItem value="USD">Доллары (USD)</SelectItem>
                          <SelectItem value="TJS">Сомони (TJS)</SelectItem>
                          <SelectItem value="KZT">Тенге (KZT)</SelectItem>
                          <SelectItem value="KGS">Сом (KGS)</SelectItem>
                          <SelectItem value="UZS">Сом (UZS)</SelectItem>
                        </SelectContent>
                      </Select>
                      <Select
                        v-else-if="item.type === 'boolean' || typeof appearanceForm[item.key] === 'boolean'"
                        v-model="appearanceForm[item.key]"
                      >
                        <SelectTrigger class="w-full">
                          <SelectValue placeholder="Выберите статус" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem :value="true">Включено</SelectItem>
                          <SelectItem :value="false">Выключено</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input v-else v-model="appearanceForm[item.key]" type="text" />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card v-else>
          <CardContent class="py-8 text-center text-sm text-muted-foreground">Настройки оформления не найдены</CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="analytics" class="space-y-4">
        <Card v-if="moduleLoading">
          <CardContent class="space-y-3 pt-6">
            <Skeleton class="h-4 w-56" />
            <Skeleton class="h-14 w-full" />
            <Skeleton class="h-14 w-full" />
            <Skeleton class="h-28 w-full" />
          </CardContent>
        </Card>
        <Card v-else-if="analyticsGroups.length">
          <CardHeader>
            <CardTitle>Яндекс Метрика</CardTitle>
            <CardDescription>Опциональная аналитика Mini App, управляется через системные настройки</CardDescription>
          </CardHeader>
          <CardContent class="pt-0 space-y-4">
            <div class="space-y-4">
              <div v-for="group in analyticsGroups" :key="`analytics-${group.name}`" class="space-y-4">
                <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {{ group.name }}
                </div>
                <div class="space-y-2.5">
                  <div
                    v-for="item in group.items"
                    :key="item.key"
                    class="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 bg-background px-3 py-2.5"
                  >
                    <div class="min-w-0">
                      <div class="text-sm font-semibold text-foreground">{{ item.label }}</div>
                      <div class="text-xs text-muted-foreground">{{ item.description }}</div>
                    </div>
                    <div class="w-52">
                      <Select
                        v-if="item.type === 'boolean' || typeof analyticsForm[item.key] === 'boolean'"
                        v-model="analyticsForm[item.key]"
                      >
                        <SelectTrigger class="w-full">
                          <SelectValue placeholder="Выберите статус" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem :value="true">Включено</SelectItem>
                          <SelectItem :value="false">Выключено</SelectItem>
                        </SelectContent>
                      </Select>
                      <Input
                        v-else
                        v-model="analyticsForm[item.key]"
                        type="text"
                        autocomplete="off"
                        autocapitalize="none"
                        autocorrect="off"
                        spellcheck="false"
                        placeholder="Например: 12345678"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <Card class="border-dashed">
              <CardHeader>
                <CardTitle class="text-sm">Карта целей</CardTitle>
                <CardDescription>Сопоставление внутреннего события Mini App и ID цели в Метрике</CardDescription>
              </CardHeader>
              <CardContent class="space-y-3 pt-0">
                <div class="grid gap-2 rounded-lg border border-border/60 bg-muted/20 p-2 md:grid-cols-[1fr_1fr_auto]">
                  <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ключ события</div>
                  <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">ID цели</div>
                  <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground text-right">Действие</div>
                </div>
                <div
                  v-for="(row, index) in analyticsGoalRows"
                  :key="`analytics-goal-${index}`"
                  class="grid gap-2 rounded-lg border border-border/60 p-2 md:grid-cols-[1fr_1fr_auto]"
                >
                  <Input
                    v-model="row.event_key"
                    type="text"
                    autocomplete="off"
                    autocapitalize="none"
                    autocorrect="off"
                    spellcheck="false"
                    placeholder="Например: order_created"
                  />
                  <Input
                    v-model="row.goal_id"
                    type="text"
                    autocomplete="off"
                    autocapitalize="none"
                    autocorrect="off"
                    spellcheck="false"
                    placeholder="Например: order_created"
                  />
                  <div class="flex justify-end">
                    <Button type="button" variant="outline" size="icon" @click="removeAnalyticsGoalRow(index)">
                      <X :size="16" />
                    </Button>
                  </div>
                </div>
                <div class="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" @click="addAnalyticsGoalRow()">
                    <Plus :size="16" />
                    Добавить цель
                  </Button>
                  <Button type="button" variant="outline" @click="restoreDefaultAnalyticsGoals">
                    Восстановить значения по умолчанию
                  </Button>
                </div>
              </CardContent>
            </Card>
            <div class="rounded-xl border border-dashed border-border/60 bg-muted/30 px-4 py-3 text-xs text-muted-foreground">
              События в Mini App отправляются по ключам карты целей. Можно переименовать ID целей без правки кода клиента.
            </div>
          </CardContent>
        </Card>
        <Card v-else>
          <CardContent class="py-8 text-center text-sm text-muted-foreground">Настройки аналитики не найдены</CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="stop-list-reasons" class="space-y-4">
        <Card>
          <CardContent class="!p-0">
            <div class="flex flex-col gap-2 border-b border-border/60 px-4 py-3 md:flex-row md:items-center md:justify-between">
              <div>
                <div class="text-sm font-semibold text-foreground">Причины стоп-листа</div>
                <div class="text-xs text-muted-foreground">Настройка причин, по которым позиции скрываются</div>
              </div>
              <Button v-if="canManageStopListReasons" @click="openModal()">
                <Plus :size="16" />
                Добавить причину
              </Button>
            </div>
            <Table v-if="reasonsLoading || reasons.length > 0">
              <TableHeader>
                <TableRow>
                  <TableHead>Название</TableHead>
                  <TableHead>Порядок</TableHead>
                  <TableHead>Статус</TableHead>
                  <TableHead class="text-right">Действия</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <template v-if="reasonsLoading">
                  <TableRow v-for="index in 5" :key="`reasons-loading-${index}`">
                    <TableCell><Skeleton class="h-4 w-40" /></TableCell>
                    <TableCell><Skeleton class="h-4 w-12" /></TableCell>
                    <TableCell><Skeleton class="h-6 w-24" /></TableCell>
                    <TableCell class="text-right"><Skeleton class="ml-auto h-8 w-20" /></TableCell>
                  </TableRow>
                </template>
                <template v-else>
                  <TableRow v-for="reason in reasons" :key="reason.id">
                    <TableCell>{{ reason.name }}</TableCell>
                    <TableCell>{{ formatNumber(reason.sort_order || 0) }}</TableCell>
                    <TableCell>
                      <Badge
                        variant="secondary"
                        :class="
                          reason.is_active
                            ? 'bg-emerald-100 text-emerald-700 border-transparent'
                            : 'bg-muted text-muted-foreground border-transparent'
                        "
                      >
                        {{ reason.is_active ? "Активна" : "Скрыта" }}
                      </Badge>
                    </TableCell>
                    <TableCell class="text-right">
                      <div v-if="canManageStopListReasons" class="flex justify-end gap-2">
                        <Button variant="ghost" size="icon" @click="openModal(reason)">
                          <Pencil :size="16" />
                        </Button>
                        <Button variant="ghost" size="icon" @click="deleteReason(reason)">
                          <Trash2 :size="16" class="text-red-600" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                </template>
              </TableBody>
            </Table>
            <div v-else class="py-8 text-center text-sm text-muted-foreground">Причины не добавлены</div>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="start-message" class="space-y-4">
        <Card v-if="telegramLoading">
          <CardContent class="space-y-3 pt-6">
            <Skeleton class="h-10 w-full" />
            <Skeleton class="h-40 w-full" />
            <Skeleton class="h-10 w-full" />
            <Skeleton class="h-24 w-full" />
          </CardContent>
        </Card>

        <Card v-else>
          <CardHeader>
            <CardTitle>Приветствие команды /start</CardTitle>
            <CardDescription>Настройка текста, изображения и кнопки для Telegram/MAX</CardDescription>
          </CardHeader>
          <CardContent class="space-y-4 pt-0">
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Платформа</FieldLabel>
              <FieldContent>
                <Select v-model="startMessagePlatform">
                  <SelectTrigger class="w-full md:w-56">
                    <SelectValue placeholder="Выберите платформу" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="telegram">Telegram</SelectItem>
                    <SelectItem value="max">MAX</SelectItem>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>
            <FieldGroup class="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Статус</FieldLabel>
                <FieldContent>
                  <Select v-model="activeStartForm.enabled">
                    <SelectTrigger class="w-full">
                      <SelectValue placeholder="Выберите статус" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem :value="true">Включено</SelectItem>
                      <SelectItem :value="false">Выключено</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{{ startPlatformLabel }} для теста</FieldLabel>
                <FieldContent>
                  <Input v-model="startMessageTestExternalIds[startMessagePlatform]" type="number" :placeholder="startPlatformTestPlaceholder" />
                </FieldContent>
              </Field>
            </FieldGroup>

            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Текст сообщения</FieldLabel>
              <FieldContent>
                <Textarea v-model="activeStartForm.text" rows="6" maxlength="4096" placeholder="Введите приветственный текст для /start / welcome" />
              </FieldContent>
            </Field>

            <FieldGroup class="grid gap-4 md:grid-cols-[1fr_auto] md:items-end">
              <Field>
                <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Изображения</FieldLabel>
                <FieldContent>
                  <input ref="telegramFileInput" type="file" accept="image/*" multiple class="hidden" @change="onTelegramFileChange" />
                  <div class="flex min-h-24 flex-col items-start justify-center rounded-xl border border-dashed border-border/70 bg-muted/20 p-3">
                    <div class="text-xs text-muted-foreground">JPG/PNG/WebP, до 10MB</div>
                    <div class="text-xs text-muted-foreground">Можно выбрать несколько файлов сразу</div>
                    <div v-if="telegramUploadState.error" class="text-xs text-red-600">{{ telegramUploadState.error }}</div>
                    <div v-if="telegramUploadState.loading" class="text-xs text-muted-foreground">
                      Загрузка {{ telegramUploadState.completed }} из {{ telegramUploadState.total }}...
                    </div>
                    <div v-if="activeStartForm.images.length" class="mt-3 grid w-full gap-3">
                      <div
                        v-for="(image, index) in activeStartForm.images"
                        :key="`${image.url}-${index}`"
                        class="grid gap-3 rounded-xl border border-border/60 bg-background p-3 md:grid-cols-[88px_1fr_auto]"
                      >
                        <img :src="image.url" alt="telegram-start-image" class="h-20 w-20 rounded-lg object-cover" />
                        <div class="grid gap-3 md:grid-cols-2">
                          <Field>
                            <FieldLabel class="text-[11px] uppercase tracking-wide text-muted-foreground">Вес</FieldLabel>
                            <FieldContent>
                              <Input
                                :model-value="image.weight"
                                type="number"
                                min="1"
                                max="1000"
                                @update:model-value="(value) => updateTelegramImageWeight(index, value)"
                              />
                            </FieldContent>
                          </Field>
                          <Field>
                            <FieldLabel class="text-[11px] uppercase tracking-wide text-muted-foreground">Статус</FieldLabel>
                            <FieldContent>
                              <Select :model-value="image.is_active" @update:model-value="(value) => updateTelegramImageActive(index, value)">
                                <SelectTrigger class="w-full">
                                  <SelectValue placeholder="Выберите статус" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem :value="true">Активно</SelectItem>
                                  <SelectItem :value="false">Отключено</SelectItem>
                                </SelectContent>
                              </Select>
                            </FieldContent>
                          </Field>
                        </div>
                        <Button
                          v-if="canManageSettings"
                          type="button"
                          variant="outline"
                          size="icon"
                          class="justify-self-start md:justify-self-end"
                          @click="removeTelegramImage(index)"
                        >
                          <X :size="16" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </FieldContent>
              </Field>
              <div class="flex w-full gap-2 md:w-auto">
                <Button
                  v-if="canManageSettings"
                  type="button"
                  variant="outline"
                  class="w-full md:w-auto"
                  @click="triggerTelegramFileInput"
                >
                  <ImagePlus :size="16" />
                  Добавить фото
                </Button>
              </div>
            </FieldGroup>

            <FieldGroup class="grid gap-4 md:grid-cols-3">
              <Field>
                <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Тип кнопки</FieldLabel>
                <FieldContent>
                  <Select v-model="activeStartForm.button_type">
                    <SelectTrigger class="w-full">
                      <SelectValue placeholder="Выберите тип" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem v-if="startMessagePlatform === 'telegram'" value="url">URL</SelectItem>
                      <SelectItem v-if="startMessagePlatform === 'telegram'" value="web_app">Web App</SelectItem>
                      <SelectItem v-if="startMessagePlatform === 'max'" value="link">Ссылка</SelectItem>
                      <SelectItem v-if="startMessagePlatform === 'max'" value="open_app">Mini App</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Текст кнопки</FieldLabel>
                <FieldContent>
                  <Input v-model="activeStartForm.button_text" type="text" maxlength="64" placeholder="Открыть меню" />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ссылка кнопки</FieldLabel>
                <FieldContent>
                  <Input v-model="activeStartForm.button_url" type="url" placeholder="https://..." />
                </FieldContent>
              </Field>
            </FieldGroup>

            <Card class="border-dashed">
              <CardHeader>
                <CardTitle class="text-sm">Предпросмотр</CardTitle>
              </CardHeader>
              <CardContent class="space-y-3 pt-0">
                <img v-if="telegramPreviewImageUrl" :src="telegramPreviewImageUrl" alt="preview" class="max-h-64 rounded-lg object-cover" />
                <p v-if="activeStartForm.images.length" class="text-xs text-muted-foreground">
                  Фото в ротации: {{ telegramActiveImagesCount }} из {{ activeStartForm.images.length }}
                </p>
                <p class="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                  {{ activeStartForm.text || "Текст приветствия не задан" }}
                </p>
                <Button v-if="activeStartForm.button_text && activeStartForm.button_url" type="button" variant="secondary" class="pointer-events-none">
                  {{ activeStartForm.button_text }}
                </Button>
              </CardContent>
            </Card>
          </CardContent>
        </Card>
      </TabsContent>

      <TabsContent value="order-notifications" class="space-y-4">
        <Card v-if="telegramLoading || telegramCitiesLoading">
          <CardContent class="space-y-3 pt-6">
            <Skeleton class="h-10 w-full" />
            <Skeleton class="h-40 w-full" />
            <Skeleton class="h-10 w-full" />
            <Skeleton class="h-24 w-full" />
          </CardContent>
        </Card>

        <Card v-else>
          <CardHeader>
            <CardTitle>Уведомления по заказам</CardTitle>
            <CardDescription>Настройка Telegram/MAX. Если обе платформы настроены, отправка идет в обе.</CardDescription>
          </CardHeader>
          <CardContent class="space-y-4 pt-0">
            <FieldGroup class="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Платформа для настройки</FieldLabel>
                <FieldContent>
                  <Select v-model="orderSettingsPlatform">
                    <SelectTrigger class="w-full">
                      <SelectValue placeholder="Выберите платформу" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="telegram">Telegram</SelectItem>
                      <SelectItem value="max">MAX</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
            </FieldGroup>
            <FieldGroup class="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Статус</FieldLabel>
                <FieldContent>
                  <Select v-model="activeOrderNotificationForm.enabled">
                    <SelectTrigger class="w-full">
                      <SelectValue placeholder="Выберите статус" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem :value="true">Включено</SelectItem>
                      <SelectItem :value="false">Выключено</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{{ orderGroupIdLabel }}</FieldLabel>
                <FieldContent>
                  <Input v-model="activeOrderNotificationForm.group_id" type="text" placeholder="-1001234567890" />
                </FieldContent>
              </Field>
            </FieldGroup>

            <FieldGroup class="grid gap-4 md:grid-cols-3">
              <Field>
                <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Новый заказ</FieldLabel>
                <FieldContent>
                  <Select v-model="activeOrderNotificationForm.notify_on_new_order">
                    <SelectTrigger class="w-full">
                      <SelectValue placeholder="Выберите статус" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem :value="true">Отправлять</SelectItem>
                      <SelectItem :value="false">Не отправлять</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Завершён</FieldLabel>
                <FieldContent>
                  <Select v-model="activeOrderNotificationForm.notify_on_completed">
                    <SelectTrigger class="w-full">
                      <SelectValue placeholder="Выберите статус" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem :value="true">Отправлять</SelectItem>
                      <SelectItem :value="false">Не отправлять</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Отменён</FieldLabel>
                <FieldContent>
                  <Select v-model="activeOrderNotificationForm.notify_on_cancelled">
                    <SelectTrigger class="w-full">
                      <SelectValue placeholder="Выберите статус" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem :value="true">Отправлять</SelectItem>
                      <SelectItem :value="false">Не отправлять</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
            </FieldGroup>

            <FieldGroup class="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Тест: тип события</FieldLabel>
                <FieldContent>
                  <Select v-model="telegramOrderTestForm.event_type">
                    <SelectTrigger class="w-full">
                      <SelectValue placeholder="Выберите событие" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="new_order">Новый заказ</SelectItem>
                      <SelectItem value="completed">Завершён</SelectItem>
                      <SelectItem value="cancelled">Отменён</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Тест: город {{ orderSettingsPlatform === "telegram" ? "(для thread)" : "(необязательно)" }}
                </FieldLabel>
                <FieldContent>
                  <Select v-model="telegramOrderTestForm.city_id">
                    <SelectTrigger class="w-full">
                      <SelectValue placeholder="Без привязки к городу" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="">Без привязки к городу</SelectItem>
                      <SelectItem v-for="city in telegramCities" :key="`test-city-${city.id}`" :value="String(city.id)">
                        {{ city.name }}
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
            </FieldGroup>

            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Режим отправки (Telegram)</FieldLabel>
              <FieldContent>
                <Select v-model="activeOrderNotificationForm.use_city_threads" :disabled="orderSettingsPlatform !== 'telegram'">
                  <SelectTrigger class="w-full">
                    <SelectValue placeholder="Выберите режим" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem :value="false">Общая группа без thread</SelectItem>
                    <SelectItem :value="true">Thread по городам</SelectItem>
                  </SelectContent>
                </Select>
              </FieldContent>
            </Field>

            <Card v-if="orderSettingsPlatform === 'telegram' && activeOrderNotificationForm.use_city_threads" class="border-dashed">
              <CardHeader>
                <CardTitle class="text-sm">Thread ID по городам</CardTitle>
                <CardDescription>Укажите `message_thread_id` для каждого нужного города</CardDescription>
              </CardHeader>
              <CardContent class="space-y-3 pt-0">
                <div
                  v-if="telegramCities.length === 0"
                  class="rounded-lg border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
                >
                  Города не найдены
                </div>
                <div
                  v-for="city in telegramCities"
                  :key="city.id"
                  class="grid gap-2.5 rounded-xl border border-border/60 bg-background px-3 py-2.5 md:grid-cols-[1fr_220px] md:items-center"
                >
                  <div class="text-sm font-medium text-foreground">{{ city.name }}</div>
                  <Input
                    :model-value="activeOrderNotificationForm.city_thread_ids[String(city.id)] || ''"
                    type="number"
                    min="1"
                    placeholder="Thread ID"
                    @update:model-value="(value) => updateCityThreadId(city.id, value)"
                  />
                </div>
              </CardContent>
            </Card>

            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Шаблон сообщения (новый заказ)</FieldLabel>
              <FieldContent>
                <Textarea
                  v-model="activeOrderNotificationForm.message_template"
                  rows="10"
                  maxlength="4096"
                  placeholder="Введите шаблон уведомления о новом заказе"
                />
              </FieldContent>
            </Field>

            <div class="rounded-xl border border-border/60 bg-muted/30 px-4 py-3">
              <div class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Плейсхолдеры</div>
              <div class="mt-2 flex flex-wrap gap-2">
                <Badge v-for="placeholder in TELEGRAM_ORDER_PLACEHOLDERS" :key="placeholder" variant="secondary">
                  {{ placeholder }}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>

    <Dialog v-if="showModal" :open="showModal" @update:open="(value) => (value ? null : closeModal())">
      <DialogContent class="w-full max-w-2xl">
        <DialogHeader>
          <DialogTitle>{{ modalTitle }}</DialogTitle>
          <DialogDescription>{{ modalSubtitle }}</DialogDescription>
        </DialogHeader>
        <form class="space-y-4" @submit.prevent="submitReason">
          <FieldGroup>
            <Field>
              <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Название</FieldLabel>
              <FieldContent>
                <Input v-model="formReason.name" required />
              </FieldContent>
            </Field>
            <FieldGroup class="grid gap-4 md:grid-cols-2">
              <Field>
                <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Порядок</FieldLabel>
                <FieldContent>
                  <Input v-model.number="formReason.sort_order" type="number" placeholder="0 = автоматически" />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel class="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Статус</FieldLabel>
                <FieldContent>
                  <Select v-model="formReason.is_active">
                    <SelectTrigger class="w-full">
                      <SelectValue placeholder="Выберите статус" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem :value="true">Активна</SelectItem>
                      <SelectItem :value="false">Скрыта</SelectItem>
                    </SelectContent>
                  </Select>
                </FieldContent>
              </Field>
            </FieldGroup>
          </FieldGroup>
          <div class="form-actions">
            <Button v-if="canManageStopListReasons" type="submit" :disabled="savingReason">
              <Spinner v-if="savingReason" class="h-4 w-4" />
              <Save v-else :size="16" />
              {{ savingReason ? "Сохранение..." : "Сохранить" }}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  </div>
</template>
<script setup>
import { devError } from "@/shared/utils/logger";
import { computed, onMounted, ref, watch } from "vue";
import { ImagePlus, Pencil, Plus, RefreshCcw, Save, SendHorizontal, Trash2, X } from "lucide-vue-next";
import api from "@/shared/api/client.js";
import Badge from "@/shared/components/ui/badge/Badge.vue";
import Button from "@/shared/components/ui/button/Button.vue";
import Card from "@/shared/components/ui/card/Card.vue";
import CardContent from "@/shared/components/ui/card/CardContent.vue";
import CardDescription from "@/shared/components/ui/card/CardDescription.vue";
import CardHeader from "@/shared/components/ui/card/CardHeader.vue";
import CardTitle from "@/shared/components/ui/card/CardTitle.vue";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/shared/components/ui/dialog/index.js";
import Input from "@/shared/components/ui/input/Input.vue";
import Textarea from "@/shared/components/ui/textarea/Textarea.vue";
import PageHeader from "@/shared/components/PageHeader.vue";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/shared/components/ui/select";
import Table from "@/shared/components/ui/table/Table.vue";
import TableBody from "@/shared/components/ui/table/TableBody.vue";
import TableCell from "@/shared/components/ui/table/TableCell.vue";
import TableHead from "@/shared/components/ui/table/TableHead.vue";
import TableHeader from "@/shared/components/ui/table/TableHeader.vue";
import TableRow from "@/shared/components/ui/table/TableRow.vue";
import Skeleton from "@/shared/components/ui/skeleton/Skeleton.vue";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/shared/components/ui/tabs";
import { Field, FieldContent, FieldGroup, FieldLabel } from "@/shared/components/ui/field";
import Spinner from "@/shared/components/ui/spinner/Spinner.vue";
import { useNotifications } from "@/shared/composables/useNotifications.js";
import { useQueryTab } from "@/shared/composables/useQueryTab.js";
import { formatNumber, normalizeBoolean, setActiveCurrencyCode } from "@/shared/utils/format.js";
import { useAuthStore } from "@/shared/stores/auth.js";

const DEFAULT_TELEGRAM_START_FORM = {
  enabled: true,
  text: "",
  image_url: "",
  images: [],
  button_type: "web_app",
  button_text: "",
  button_url: "",
};
const DEFAULT_MAX_START_FORM = {
  enabled: true,
  text: "",
  image_url: "",
  images: [],
  button_type: "open_app",
  button_text: "",
  button_url: "",
};
const DEFAULT_TELEGRAM_ORDER_FORM = {
  enabled: false,
  notify_on_new_order: true,
  notify_on_completed: false,
  notify_on_cancelled: false,
  group_id: "",
  use_city_threads: false,
  city_thread_ids: {},
  message_template: "",
};
const DEFAULT_MAX_ORDER_FORM = {
  enabled: false,
  notify_on_new_order: true,
  notify_on_completed: false,
  notify_on_cancelled: false,
  group_id: "",
  message_template: "",
};

const moduleItems = ref([]);
const moduleForm = ref({});
const mapItems = ref([]);
const mapForm = ref({});
const appearanceItems = ref([]);
const appearanceForm = ref({});
const analyticsItems = ref([]);
const analyticsForm = ref({});
const analyticsGoalRows = ref([]);
const moduleLoading = ref(false);
const moduleSaving = ref(false);
const mapsTesting = ref(false);
const analyticsTesting = ref(false);
const reasons = ref([]);
const reasonsLoading = ref(false);
const SYSTEM_TAB_OPTIONS = [
  { value: "modules", label: "Модули" },
  { value: "maps", label: "Карты" },
  { value: "appearance", label: "Оформление" },
  { value: "analytics", label: "Аналитика" },
  { value: "stop-list-reasons", label: "Причины стоп-листа" },
  { value: "start-message", label: "Приветственное сообщение" },
  { value: "order-notifications", label: "Уведомления по заказам" },
];
const tabs = SYSTEM_TAB_OPTIONS;
const activeTab = useQueryTab({
  defaultValue: "modules",
  allowedValues: SYSTEM_TAB_OPTIONS.map((tab) => tab.value),
});
const showModal = ref(false);
const editing = ref(null);
const savingReason = ref(false);
const telegramLoading = ref(false);
const telegramSaving = ref(false);
const telegramTesting = ref(false);
const telegramOrderTesting = ref(false);
const telegramFileInput = ref(null);
const startMessageTestExternalIds = ref({
  telegram: "",
  max: "",
});
const telegramUploadState = ref({
  loading: false,
  error: null,
  total: 0,
  completed: 0,
});
const telegramCities = ref([]);
const telegramCitiesLoading = ref(false);
const telegramSettingsLoaded = ref(false);
const startMessagePlatform = ref("telegram");
const orderSettingsPlatform = ref("telegram");
const startMessageForms = ref({
  telegram: { ...DEFAULT_TELEGRAM_START_FORM },
  max: { ...DEFAULT_MAX_START_FORM },
});
const orderNotificationForms = ref({
  telegram: { ...DEFAULT_TELEGRAM_ORDER_FORM },
  max: { ...DEFAULT_MAX_ORDER_FORM },
});
const telegramOrderTestForm = ref({
  event_type: "new_order",
  city_id: "",
});
const formReason = ref({
  name: "",
  sort_order: 0,
  is_active: true,
});
const authStore = useAuthStore();
const { showErrorNotification, showSuccessNotification } = useNotifications();
const canManageSettings = computed(() => authStore.hasPermission("system.settings.manage"));
const canManageStopListReasons = computed(() => authStore.hasPermission("menu.stop_list.manage"));

const modalTitle = computed(() => (editing.value ? "Редактировать причину" : "Новая причина"));
const modalSubtitle = computed(() => (editing.value ? "Измените параметры" : "Создайте причину стоп-листа"));
const percentKeys = new Set();
const MAP_SETTING_KEYS = new Set(["yandex_js_api_key", "yandex_suggest_api_key", "maps_default_language", "maps_default_country"]);
const APPEARANCE_SETTING_KEYS = new Set(["menu_badges_enabled", "menu_cards_layout", "site_currency"]);
const ANALYTICS_SETTING_KEYS = new Set([
  "yandex_metrika_enabled",
  "yandex_metrika_counter_id",
  "yandex_metrika_webvisor_enabled",
  "yandex_metrika_clickmap_enabled",
  "yandex_metrika_track_links_enabled",
  "yandex_metrika_accurate_bounce_enabled",
]);
const ANALYTICS_GOAL_KEY_REGEX = /^[a-z0-9_]{2,64}$/i;
const DEFAULT_ANALYTICS_GOALS = {
  login_success: "login_success",
  login_failed: "login_failed",
  add_to_cart: "add_to_cart",
  begin_checkout: "begin_checkout",
  order_created: "order_created",
  order_create_failed: "order_create_failed",
};
const primitiveTypes = new Set(["boolean", "string", "number"]);
const TELEGRAM_ORDER_PLACEHOLDERS = [
  "{{order_id}}",
  "{{order_number}}",
  "{{order_status}}",
  "{{order_created_at}}",
  "{{order_desired_time}}",
  "{{order_type}}",
  "{{order_type_label}}",
  "{{city_id}}",
  "{{city_name}}",
  "{{city_timezone}}",
  "{{branch_id}}",
  "{{branch_name}}",
  "{{branch_address}}",
  "{{branch_phone}}",
  "{{user_id}}",
  "{{user_first_name}}",
  "{{user_last_name}}",
  "{{user_full_name}}",
  "{{user_phone}}",
  "{{user_telegram_id}}",
  "{{delivery_address}}",
  "{{delivery_street}}",
  "{{delivery_house}}",
  "{{delivery_entrance}}",
  "{{delivery_floor}}",
  "{{delivery_apartment}}",
  "{{delivery_intercom}}",
  "{{delivery_latitude}}",
  "{{delivery_longitude}}",
  "{{payment_method}}",
  "{{payment_method_label}}",
  "{{change_from}}",
  "{{subtotal}}",
  "{{delivery_cost}}",
  "{{bonus_spent}}",
  "{{total}}",
  "{{items_count}}",
  "{{items_total_quantity}}",
  "{{items_list}}",
  "{{comment}}",
];
const activeStartForm = computed(() => startMessageForms.value[startMessagePlatform.value] || startMessageForms.value.telegram);
const activeOrderNotificationForm = computed(() => orderNotificationForms.value[orderSettingsPlatform.value] || orderNotificationForms.value.telegram);
const startPlatformLabel = computed(() => (startMessagePlatform.value === "max" ? "MAX ID" : "Telegram ID"));
const startPlatformTestPlaceholder = computed(() => (startMessagePlatform.value === "max" ? "-123456789 или 123456789" : "123456789"));
const orderGroupIdLabel = computed(() => (orderSettingsPlatform.value === "max" ? "Chat ID (MAX)" : "Group ID (Telegram)"));

const normalizeTelegramForm = (value = {}) => {
  const config = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const buttonType = String(config.button_type || "web_app").toLowerCase();
  const sourceImages = Array.isArray(config.images) ? config.images : [];
  const images = sourceImages
    .map((image) => {
      if (!image || typeof image !== "object" || Array.isArray(image)) return null;
      const url = String(image.url || "").trim();
      if (!url) return null;
      const weightRaw = Number(image.weight);
      const weight = Number.isFinite(weightRaw) && weightRaw > 0 ? Math.round(weightRaw) : 1;
      return {
        url,
        weight: Math.min(Math.max(weight, 1), 1000),
        is_active: image.is_active !== false,
      };
    })
    .filter(Boolean);
  const legacyImageUrl = String(config.image_url || "").trim();
  if (legacyImageUrl && !images.some((image) => image.url === legacyImageUrl)) {
    images.push({
      url: legacyImageUrl,
      weight: 1,
      is_active: true,
    });
  }
  const primaryImageUrl = images.find((image) => image.is_active)?.url || images[0]?.url || "";
  return {
    enabled: config.enabled !== false,
    text: String(config.text || ""),
    image_url: primaryImageUrl,
    images,
    button_type: buttonType === "url" || buttonType === "web_app" ? buttonType : "web_app",
    button_text: String(config.button_text || ""),
    button_url: String(config.button_url || ""),
  };
};

const normalizeMaxStartForm = (value = {}) => {
  const normalized = normalizeTelegramForm(value);
  return {
    ...normalized,
    button_type: normalized.button_type === "url" ? "link" : String(value?.button_type || "open_app").toLowerCase() === "link" ? "link" : "open_app",
  };
};

const normalizeTelegramOrderNotificationForm = (value = {}) => {
  const config = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const sourceMap =
    config.city_thread_ids && typeof config.city_thread_ids === "object" && !Array.isArray(config.city_thread_ids) ? config.city_thread_ids : {};
  const cityThreadIds = Object.entries(sourceMap).reduce((acc, [cityId, threadId]) => {
    const normalizedCityId = Number(cityId);
    const normalizedThreadId = Number(threadId);
    if (!Number.isInteger(normalizedCityId) || normalizedCityId <= 0) return acc;
    if (!Number.isInteger(normalizedThreadId) || normalizedThreadId <= 0) return acc;
    acc[String(normalizedCityId)] = normalizedThreadId;
    return acc;
  }, {});

  return {
    enabled: config.enabled === true,
    notify_on_new_order: config.notify_on_new_order !== false,
    notify_on_completed: config.notify_on_completed === true,
    notify_on_cancelled: config.notify_on_cancelled === true,
    group_id: String(config.group_id || ""),
    use_city_threads: config.use_city_threads === true,
    city_thread_ids: cityThreadIds,
    message_template: String(config.message_template || ""),
  };
};

const normalizeMaxOrderNotificationForm = (value = {}) => {
  const config = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return {
    enabled: config.enabled === true,
    notify_on_new_order: config.notify_on_new_order !== false,
    notify_on_completed: config.notify_on_completed === true,
    notify_on_cancelled: config.notify_on_cancelled === true,
    group_id: String(config.group_id || ""),
    message_template: String(config.message_template || ""),
  };
};

const mapAnalyticsGoalsToRows = (goals) => {
  const source = goals && typeof goals === "object" && !Array.isArray(goals) ? goals : DEFAULT_ANALYTICS_GOALS;
  const rows = Object.entries(source).map(([eventKey, goalId]) => ({
    event_key: String(eventKey || "").trim(),
    goal_id: String(goalId || "").trim(),
  }));
  return rows.length > 0 ? rows : [{ event_key: "", goal_id: "" }];
};

const buildAnalyticsGoalsPayload = () => {
  const payload = {};
  const keySet = new Set();

  for (let index = 0; index < analyticsGoalRows.value.length; index += 1) {
    const row = analyticsGoalRows.value[index] || {};
    const eventKey = String(row.event_key || "").trim();
    const goalId = String(row.goal_id || "").trim();

    if (!eventKey && !goalId) {
      continue;
    }
    if (!eventKey || !goalId) {
      return { payload: null, error: `Строка #${index + 1}: заполните и ключ события, и ID цели` };
    }
    if (!ANALYTICS_GOAL_KEY_REGEX.test(eventKey)) {
      return {
        payload: null,
        error: `Строка #${index + 1}: ключ события должен содержать только буквы, цифры и "_" (2-64 символа)`,
      };
    }
    if (keySet.has(eventKey)) {
      return { payload: null, error: `Строка #${index + 1}: дублирующийся ключ события "${eventKey}"` };
    }

    keySet.add(eventKey);
    payload[eventKey] = goalId;
  }

  if (Object.keys(payload).length === 0) {
    return { payload: null, error: "Добавьте хотя бы одну цель в карту событий" };
  }

  return { payload, error: null };
};

const addAnalyticsGoalRow = () => {
  analyticsGoalRows.value.push({
    event_key: "",
    goal_id: "",
  });
};

const removeAnalyticsGoalRow = (index) => {
  analyticsGoalRows.value.splice(index, 1);
  if (analyticsGoalRows.value.length === 0) {
    analyticsGoalRows.value.push({
      event_key: "",
      goal_id: "",
    });
  }
};

const restoreDefaultAnalyticsGoals = () => {
  analyticsGoalRows.value = mapAnalyticsGoalsToRows(DEFAULT_ANALYTICS_GOALS);
};

const applySettingsResponse = (data) => {
  const settings = data?.settings || {};
  setActiveCurrencyCode(settings.site_currency || "RUB");
  const primitiveItems = (data?.items || []).filter((item) => item.group !== "Интеграции" && primitiveTypes.has(item.type));
  moduleItems.value = primitiveItems.filter(
    (item) => !MAP_SETTING_KEYS.has(item.key) && !APPEARANCE_SETTING_KEYS.has(item.key) && !ANALYTICS_SETTING_KEYS.has(item.key),
  );
  mapItems.value = primitiveItems.filter((item) => MAP_SETTING_KEYS.has(item.key));
  appearanceItems.value = primitiveItems.filter((item) => APPEARANCE_SETTING_KEYS.has(item.key));
  analyticsItems.value = primitiveItems.filter((item) => ANALYTICS_SETTING_KEYS.has(item.key));
  hydrateForm(moduleItems.value, moduleForm);
  hydrateForm(mapItems.value, mapForm);
  hydrateForm(appearanceItems.value, appearanceForm);
  hydrateForm(analyticsItems.value, analyticsForm);
  analyticsGoalRows.value = mapAnalyticsGoalsToRows(settings.yandex_metrika_goals);
  startMessageForms.value = {
    telegram: normalizeTelegramForm(settings.telegram_start_message),
    max: normalizeMaxStartForm(settings.max_start_message),
  };
  orderNotificationForms.value = {
    telegram: normalizeTelegramOrderNotificationForm(settings.telegram_new_order_notification),
    max: normalizeMaxOrderNotificationForm(settings.max_new_order_notification),
  };
  telegramUploadState.value = {
    loading: false,
    error: null,
    total: 0,
    completed: 0,
  };
};

const groupSettings = (list) => {
  const groups = new Map();
  for (const item of list) {
    const groupName = item.group || "Общее";
    if (!groups.has(groupName)) {
      groups.set(groupName, []);
    }
    groups.get(groupName).push(item);
  }
  return Array.from(groups.entries()).map(([name, groupItems]) => ({ name, items: groupItems }));
};

const groupedModuleSettings = computed(() => groupSettings(moduleItems.value));
const moduleGroups = computed(() => groupedModuleSettings.value);
const mapGroups = computed(() => groupSettings(mapItems.value));
const appearanceGroups = computed(() => groupSettings(appearanceItems.value));
const analyticsGroups = computed(() => groupSettings(analyticsItems.value));
const telegramActiveImagesCount = computed(() => activeStartForm.value.images.filter((image) => image.is_active !== false).length);
const telegramPreviewImageUrl = computed(() => {
  return activeStartForm.value.images.find((image) => image.is_active !== false)?.url || activeStartForm.value.images[0]?.url || "";
});

const normalizeInteger = (targetForm, key) => {
  const value = targetForm.value[key];
  if (!Number.isFinite(value)) return;
  targetForm.value[key] = Math.round(value);
};

const toFormValue = (item) => {
  if (item.type === "number" && percentKeys.has(item.key)) {
    return Number.isFinite(item.value) ? Math.round(item.value * 100) : 0;
  }
  return item.value;
};

const hydrateForm = (list, targetForm) => {
  targetForm.value = list.reduce((acc, item) => {
    acc[item.key] = toFormValue(item);
    return acc;
  }, {});
};

const loadModuleSettings = async () => {
  moduleLoading.value = true;
  try {
    const response = await api.get("/api/settings/admin");
    applySettingsResponse(response.data);
  } catch (error) {
    devError("Failed to load settings:", error);
    showErrorNotification("Ошибка при загрузке настроек");
  } finally {
    moduleLoading.value = false;
  }
};

const saveModuleSettings = async () => {
  if (!canManageSettings.value) return;
  moduleSaving.value = true;
  try {
    const payload = {};
    for (const [key, value] of Object.entries(moduleForm.value)) {
      if (percentKeys.has(key)) {
        payload[key] = Number.isFinite(value) ? value / 100 : value;
      } else {
        payload[key] = value;
      }
    }
    const response = await api.put("/api/settings/admin", { settings: payload });
    applySettingsResponse(response.data);
    showSuccessNotification("Настройки сохранены");
  } catch (error) {
    devError("Failed to save settings:", error);
    const message = error.response?.data?.errors?.settings || "Ошибка при сохранении настроек";
    showErrorNotification(message);
  } finally {
    moduleSaving.value = false;
  }
};

const saveMapSettings = async () => {
  if (!canManageSettings.value) return;
  moduleSaving.value = true;
  try {
    const payload = {};
    for (const [key, value] of Object.entries(mapForm.value)) {
      payload[key] = value;
    }
    const response = await api.put("/api/settings/admin", { settings: payload });
    applySettingsResponse(response.data);
    showSuccessNotification("Настройки карт сохранены");
  } catch (error) {
    devError("Failed to save maps settings:", error);
    const message = error.response?.data?.errors?.settings || "Ошибка при сохранении настроек карт";
    showErrorNotification(message);
  } finally {
    moduleSaving.value = false;
  }
};

const saveAppearanceSettings = async () => {
  if (!canManageSettings.value) return;
  moduleSaving.value = true;
  try {
    const payload = {};
    for (const [key, value] of Object.entries(appearanceForm.value)) {
      payload[key] = value;
    }
    const response = await api.put("/api/settings/admin", { settings: payload });
    applySettingsResponse(response.data);
    showSuccessNotification("Настройки оформления сохранены");
  } catch (error) {
    devError("Failed to save appearance settings:", error);
    const message = error.response?.data?.errors?.settings || "Ошибка при сохранении настроек оформления";
    showErrorNotification(message);
  } finally {
    moduleSaving.value = false;
  }
};

const saveAnalyticsSettings = async () => {
  if (!canManageSettings.value) return;
  moduleSaving.value = true;
  try {
    const { payload: parsedGoals, error: goalsError } = buildAnalyticsGoalsPayload();
    if (goalsError) {
      showErrorNotification(goalsError);
      return;
    }
    const payload = {};
    for (const [key, value] of Object.entries(analyticsForm.value)) {
      payload[key] = value;
    }
    payload.yandex_metrika_goals = parsedGoals;

    const response = await api.put("/api/settings/admin", { settings: payload });
    applySettingsResponse(response.data);
    showSuccessNotification("Настройки аналитики сохранены");
  } catch (error) {
    devError("Failed to save analytics settings:", error);
    const message =
      error.response?.data?.errors?.yandex_metrika_counter_id ||
      error.response?.data?.errors?.yandex_metrika_goals ||
      error.response?.data?.errors?.settings ||
      "Ошибка при сохранении настроек аналитики";
    showErrorNotification(message);
  } finally {
    moduleSaving.value = false;
  }
};

const testAnalyticsSettings = async () => {
  if (!canManageSettings.value) return;
  analyticsTesting.value = true;
  try {
    const { data } = await api.post("/api/settings/admin/metrika/test");
    const counterId = String(data?.data?.counter_id || "");
    const goalsCount = Number(data?.data?.goals_count || 0);
    showSuccessNotification(`Метрика готова: счетчик ${counterId}, целей ${goalsCount}`);
  } catch (error) {
    devError("Failed to test metrika settings:", error);
    showErrorNotification(error.response?.data?.error || "Не удалось проверить настройки Метрики");
  } finally {
    analyticsTesting.value = false;
  }
};

const testMapsSettings = async () => {
  if (!canManageSettings.value) return;
  mapsTesting.value = true;
  try {
    const { data } = await api.post("/api/settings/admin/maps/test");
    const suggestCount = Number(data?.data?.suggest_count || 0);
    const geocodeCount = Number(data?.data?.geocode_count || 0);
    showSuccessNotification(`Яндекс API доступен: suggest ${suggestCount}, geocode ${geocodeCount}`);
  } catch (error) {
    devError("Failed to test yandex maps settings:", error);
    showErrorNotification(error.response?.data?.error || "Не удалось проверить Яндекс API");
  } finally {
    mapsTesting.value = false;
  }
};

const loadTelegramSettings = async () => {
  telegramLoading.value = true;
  try {
    const [settingsResponse, citiesResponse] = await Promise.all([api.get("/api/settings/admin"), api.get("/api/cities/admin/all")]);
    applySettingsResponse(settingsResponse.data);
    const cities = Array.isArray(citiesResponse.data?.cities) ? citiesResponse.data.cities : [];
    telegramCities.value = cities.filter((city) => city?.is_active === true || city?.is_active === 1);
    telegramSettingsLoaded.value = true;
  } catch (error) {
    devError("Failed to load telegram start settings:", error);
    showErrorNotification("Ошибка при загрузке настроек Telegram");
  } finally {
    telegramLoading.value = false;
  }
};

const loadTelegramStartSettings = async () => {
  await loadTelegramSettings();
};

const loadTelegramOrderSettings = async () => {
  await loadTelegramSettings();
};

const saveTelegramStartSettings = async () => {
  if (!canManageSettings.value) return;
  telegramSaving.value = true;
  try {
    const payload = startMessagePlatform.value === "max" ? normalizeMaxStartForm(activeStartForm.value) : normalizeTelegramForm(activeStartForm.value);
    const settingKey = startMessagePlatform.value === "max" ? "max_start_message" : "telegram_start_message";
    const response = await api.put("/api/settings/admin", {
      settings: {
        [settingKey]: payload,
      },
    });
    applySettingsResponse(response.data);
    showSuccessNotification(`Настройки приветствия (${startMessagePlatform.value === "max" ? "MAX" : "Telegram"}) сохранены`);
  } catch (error) {
    devError("Failed to save telegram start settings:", error);
    const message =
      error.response?.data?.errors?.telegram_start_message ||
      error.response?.data?.errors?.max_start_message ||
      error.response?.data?.errors?.settings ||
      "Ошибка при сохранении /start";
    showErrorNotification(message);
  } finally {
    telegramSaving.value = false;
  }
};

const saveTelegramOrderSettings = async () => {
  if (!canManageSettings.value) return;
  telegramSaving.value = true;
  try {
    const isMax = orderSettingsPlatform.value === "max";
    const orderNotificationPayload = isMax
      ? normalizeMaxOrderNotificationForm(activeOrderNotificationForm.value)
      : normalizeTelegramOrderNotificationForm(activeOrderNotificationForm.value);
    const orderSettingsKey = isMax ? "max_new_order_notification" : "telegram_new_order_notification";
    const response = await api.put("/api/settings/admin", {
      settings: {
        [orderSettingsKey]: orderNotificationPayload,
      },
    });
    applySettingsResponse(response.data);
    showSuccessNotification("Настройки уведомлений по заказам сохранены");
  } catch (error) {
    devError("Failed to save telegram order notification settings:", error);
    const message =
      error.response?.data?.errors?.telegram_new_order_notification ||
      error.response?.data?.errors?.max_new_order_notification ||
      error.response?.data?.errors?.settings ||
      "Ошибка при сохранении уведомлений по заказам";
    showErrorNotification(message);
  } finally {
    telegramSaving.value = false;
  }
};

const updateCityThreadId = (cityId, value) => {
  if (orderSettingsPlatform.value !== "telegram") return;
  const normalizedCityId = String(Number(cityId));
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    delete activeOrderNotificationForm.value.city_thread_ids[normalizedCityId];
    return;
  }
  activeOrderNotificationForm.value.city_thread_ids[normalizedCityId] = parsed;
};

const sendTelegramStartTest = async () => {
  if (!canManageSettings.value) return;
  const externalId = Number(startMessageTestExternalIds.value[startMessagePlatform.value] || "");
  if (!Number.isFinite(externalId) || externalId === 0) {
    showErrorNotification(`Укажите корректный ${startPlatformLabel.value} для теста`);
    return;
  }
  telegramTesting.value = true;
  try {
    await api.post("/api/settings/admin/start-message/test", {
      platform: startMessagePlatform.value,
      external_id: externalId,
    });
    showSuccessNotification("Тестовое сообщение отправлено");
  } catch (error) {
    devError("Failed to send telegram start test:", error);
    showErrorNotification(error.response?.data?.error || "Не удалось отправить тест");
  } finally {
    telegramTesting.value = false;
  }
};

const sendTelegramOrderTest = async () => {
  if (!canManageSettings.value) return;
  telegramOrderTesting.value = true;
  try {
    const cityIdValue = String(telegramOrderTestForm.value.city_id || "").trim();
    const payload = {
      event_type: telegramOrderTestForm.value.event_type,
      city_id: cityIdValue ? Number(cityIdValue) : null,
    };
    await api.post("/api/settings/admin/orders-notification/test", payload);
    showSuccessNotification("Тестовое уведомление отправлено");
  } catch (error) {
    devError("Failed to send telegram order notification test:", error);
    showErrorNotification(error.response?.data?.error || "Не удалось отправить тестовое уведомление");
  } finally {
    telegramOrderTesting.value = false;
  }
};

const loadReasons = async () => {
  reasonsLoading.value = true;
  try {
    const response = await api.get("/api/menu/admin/stop-list-reasons");
    reasons.value = response.data.reasons || [];
  } catch (error) {
    devError("Failed to load reasons:", error);
    showErrorNotification("Ошибка при загрузке причин");
  } finally {
    reasonsLoading.value = false;
  }
};

const openModal = (reason = null) => {
  if (!canManageStopListReasons.value) return;
  editing.value = reason;
  formReason.value = reason
    ? {
        name: reason.name,
        sort_order: reason.sort_order || 0,
        is_active: normalizeBoolean(reason.is_active, true),
      }
    : {
        name: "",
        sort_order: 0,
        is_active: true,
      };
  showModal.value = true;
};

const closeModal = () => {
  showModal.value = false;
};

const submitReason = async () => {
  if (!canManageStopListReasons.value) return;
  savingReason.value = true;
  try {
    if (editing.value) {
      await api.put(`/api/menu/admin/stop-list-reasons/${editing.value.id}`, formReason.value);
    } else {
      await api.post("/api/menu/admin/stop-list-reasons", formReason.value);
    }
    showModal.value = false;
    await loadReasons();
  } catch (error) {
    devError("Failed to save reason:", error);
    showErrorNotification(`Ошибка при сохранении причины: ${error.response?.data?.error || error.message}`);
  } finally {
    savingReason.value = false;
  }
};

const deleteReason = async (reason) => {
  if (!canManageStopListReasons.value) return;
  if (!confirm(`Удалить причину "${reason.name}"?`)) return;
  try {
    await api.delete(`/api/menu/admin/stop-list-reasons/${reason.id}`);
    await loadReasons();
  } catch (error) {
    devError("Failed to delete reason:", error);
    showErrorNotification(`Ошибка при удалении причины: ${error.response?.data?.error || error.message}`);
  }
};

const triggerTelegramFileInput = () => {
  if (!canManageSettings.value) return;
  telegramFileInput.value?.click();
};

const onTelegramFileChange = (event) => {
  const files = Array.from(event.target.files || []);
  if (event.target) {
    event.target.value = "";
  }
  if (!files.length) return;
  void handleTelegramFiles(files);
};

const syncTelegramPrimaryImage = () => {
  activeStartForm.value.image_url = telegramPreviewImageUrl.value;
};

const handleTelegramFiles = async (files) => {
  if (!canManageSettings.value) return;
  const validFiles = files.filter((file) => file?.type?.startsWith("image/"));
  if (!validFiles.length) {
    telegramUploadState.value = { loading: false, error: "Нужен файл изображения", total: 0, completed: 0 };
    return;
  }
  if (validFiles.some((file) => file.size > 10 * 1024 * 1024)) {
    telegramUploadState.value = { loading: false, error: "Один из файлов больше 10MB", total: 0, completed: 0 };
    return;
  }

  telegramUploadState.value = {
    loading: true,
    error: null,
    total: validFiles.length,
    completed: 0,
  };

  let uploadedCount = 0;
  for (const file of validFiles) {
    const formData = new FormData();
    formData.append("image", file);
    try {
      const response = await api.post("/api/uploads/telegram-start/1", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      const uploadedUrl = response.data?.data?.url || "";
      if (uploadedUrl && !activeStartForm.value.images.some((image) => image.url === uploadedUrl)) {
        activeStartForm.value.images.push({
          url: uploadedUrl,
          weight: 1,
          is_active: true,
        });
      }
      uploadedCount += 1;
      telegramUploadState.value.completed = uploadedCount;
    } catch (error) {
      devError("Ошибка загрузки изображения /start:", error);
      telegramUploadState.value.error = "Часть изображений не удалось загрузить";
    }
  }

  telegramUploadState.value.loading = false;
  syncTelegramPrimaryImage();
};

const updateTelegramImageWeight = (index, value) => {
  if (!canManageSettings.value) return;
  const image = activeStartForm.value.images[index];
  if (!image) return;
  const parsed = Number(value);
  image.weight = Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.round(parsed), 1000) : 1;
  syncTelegramPrimaryImage();
};

const updateTelegramImageActive = (index, value) => {
  if (!canManageSettings.value) return;
  const image = activeStartForm.value.images[index];
  if (!image) return;
  image.is_active = normalizeBoolean(value, true);
  syncTelegramPrimaryImage();
};

const removeTelegramImage = (index) => {
  if (!canManageSettings.value) return;
  activeStartForm.value.images.splice(index, 1);
  syncTelegramPrimaryImage();
};

onMounted(async () => {
  try {
    await loadModuleSettings();
    await loadReasons();
  } catch (error) {
    devError("Ошибка загрузки настроек системы:", error);
    showErrorNotification("Ошибка загрузки настроек системы");
  }
});

watch(
  () => activeTab.value,
  async (value) => {
    if (value !== "start-message" && value !== "order-notifications") return;
    if (telegramSettingsLoaded.value) return;
    telegramCitiesLoading.value = true;
    try {
      await loadTelegramSettings();
    } finally {
      telegramCitiesLoading.value = false;
    }
  },
);
</script>
